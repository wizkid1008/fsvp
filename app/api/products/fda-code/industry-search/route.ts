// GET ?industry=NN&filter= — browse FDA Product Code Builder codes in one
// industry, with an optional local text filter.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  listProductCodesForIndustry,
  pcbCredentialsFromEnv,
  PcbError,
} from "@/lib/regulatory/product-code-builder";

export const runtime = "edge";

const MAX_ROWS = 50;

function matchesAll(row: Record<string, string | null>, filter: string): boolean {
  if (!filter) return true;
  const haystack = Object.values(row).filter(Boolean).join(" ").toLowerCase();
  return filter.toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
}

function matchesAny(row: Record<string, string | null>, filter: string): boolean {
  if (!filter) return true;
  const haystack = Object.values(row).filter(Boolean).join(" ").toLowerCase();
  return filter.toLowerCase().split(/\s+/).filter(Boolean).some((term) => haystack.includes(term));
}

function normalizeRow(row: Record<string, unknown>): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value === null || value === undefined ? null : String(value),
    ])
  );
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

  const industry = req.nextUrl.searchParams.get("industry")?.trim() ?? "";
  if (!/^\d+$/.test(industry)) {
    return NextResponse.json({ error: "Choose an FDA industry first." }, { status: 400 });
  }
  const filter = req.nextUrl.searchParams.get("filter")?.trim() ?? "";

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
    const rows = (await listProductCodesForIndustry(Number(industry), creds)).map(normalizeRow);
    const exact = rows.filter((row) => matchesAll(row, filter));
    const loose = exact.length > 0 ? exact : rows.filter((row) => matchesAny(row, filter));
    const filtered = loose.length > 0 ? loose : rows;
    return NextResponse.json({
      ok: true,
      industry,
      filter,
      fallback: filter.length > 0 && exact.length === 0,
      total: filtered.length,
      truncated: filtered.length > MAX_ROWS,
      rows: filtered.slice(0, MAX_ROWS),
    });
  } catch (err) {
    const message = err instanceof PcbError
      ? err.message
      : "FDA's Product Code Builder could not be reached.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
