// GET — search FDA Product Code Builder for final product-code candidates from
// the selected industry, product, subclass/container, and PIC/process.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { pcbCredentialsFromEnv, PcbError, searchPartialCodes } from "@/lib/regulatory/product-code-builder";

export const runtime = "edge";

const MAX_ROWS = 25;

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
  const klass = req.nextUrl.searchParams.get("class")?.trim().toUpperCase() ?? "";
  const group = req.nextUrl.searchParams.get("group")?.trim().toUpperCase() ?? "";
  const subclass = req.nextUrl.searchParams.get("subclass")?.trim().toUpperCase() ?? "";
  const pic = req.nextUrl.searchParams.get("pic")?.trim().toUpperCase() ?? "";

  if (!/^\d+$/.test(industry) || !/^[A-Z]$/.test(klass) || !/^[A-Z0-9]{2}$/.test(group)) {
    return NextResponse.json({ error: "Choose an FDA industry and product first." }, { status: 400 });
  }
  if (subclass && !/^[A-Z0-9-]$/.test(subclass)) {
    return NextResponse.json({ error: "Subclass must be one character." }, { status: 400 });
  }
  if (pic && !/^[A-Z0-9-]$/.test(pic)) {
    return NextResponse.json({ error: "PIC must be one character." }, { status: 400 });
  }

  const creds = pcbCredentialsFromEnv();
  if (!creds) {
    return NextResponse.json(
      { error: "The FDA Product Code Builder integration is not configured." },
      { status: 503 }
    );
  }

  try {
    const rows = (await searchPartialCodes({
      industry: Number(industry),
      class: klass,
      group,
      subclass: subclass || undefined,
      pic: pic || undefined,
    }, creds)).map(normalizeRow);

    return NextResponse.json({
      ok: true,
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
