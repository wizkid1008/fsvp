// GET ?name= — search FDA Product Code Builder product names from the product
// code card.
//
// This mirrors the classification-request lookup, but lives under products
// because the result is an entry-line product code, not a commodity taxonomy
// decision.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { pcbCredentialsFromEnv, searchProductsByName, PcbError } from "@/lib/regulatory/product-code-builder";

export const runtime = "edge";

const MAX_ROWS = 25;
const STOP_WORDS = new Set(["fresh", "frozen", "dried", "raw", "green", "roasted", "beans"]);

function uniq(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length >= 2))];
}

function singularize(word: string): string {
  return word.endsWith("ies")
    ? `${word.slice(0, -3)}y`
    : word.endsWith("s") && word.length > 3
      ? word.slice(0, -1)
      : word;
}

function searchTerms(name: string): string[] {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const singular = words.map(singularize);
  const core = singular.filter((word) => !STOP_WORDS.has(word));

  return uniq([
    name,
    singular.join(" "),
    core.join(" "),
    ...singular,
    ...core,
  ]).slice(0, 6);
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "us_importer" && profile?.role !== "administrator") {
    return NextResponse.json({ error: "This lookup is for importers and administrators." }, { status: 403 });
  }

  const name = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (name.length < 2) {
    return NextResponse.json({ error: "Give at least two characters to search for." }, { status: 400 });
  }

  const creds = pcbCredentialsFromEnv();
  if (!creds) {
    return NextResponse.json(
      {
        error:
          "The FDA Product Code Builder integration is not configured. Add FDA_PCB_USER and " +
          "FDA_PCB_KEY to enable in-app lookup.",
      },
      { status: 503 }
    );
  }

  try {
    const tried: string[] = [];
    const byCode = new Map<string, Record<string, string | null>>();

    for (const term of searchTerms(name)) {
      tried.push(term);
      const found = await searchProductsByName(term, creds);
      for (const row of found) {
        const key = Object.entries(row).find(([column, value]) =>
          Boolean(value && /code/i.test(column) && /^[0-9A-Z-]{5,7}$/i.test(value))
        )?.[1] ?? JSON.stringify(row);
        if (!byCode.has(key)) byCode.set(key, row);
      }
      if (byCode.size >= MAX_ROWS) break;
    }

    const rows = [...byCode.values()];
    return NextResponse.json({
      ok: true,
      searched_for: name,
      tried,
      truncated: rows.length > MAX_ROWS,
      rows: rows.slice(0, MAX_ROWS),
    });
  } catch (err) {
    const message = err instanceof PcbError
      ? err.message
      : "FDA's Product Code Builder could not be reached.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
