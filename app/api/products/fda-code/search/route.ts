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
    const rows = await searchProductsByName(name, creds);
    return NextResponse.json({
      ok: true,
      searched_for: name,
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
