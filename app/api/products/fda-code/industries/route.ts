// GET — list FDA Product Code Builder industries for the product-code card.

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listIndustries, pcbCredentialsFromEnv, PcbError } from "@/lib/regulatory/product-code-builder";

export const runtime = "edge";

function industryId(row: Record<string, string | null>): string | null {
  const preferred = Object.entries(row).find(([key, value]) =>
    Boolean(value && /(industry.*id|industry.*code|^id$|^code$)/i.test(key) && /\d+/.test(value))
  )?.[1];
  const fallback = Object.values(row).find((value) => Boolean(value && /\b\d{1,3}\b/.test(value)));
  const match = (preferred ?? fallback)?.match(/\b\d{1,3}\b/);
  return match?.[0] ?? null;
}

function industryName(row: Record<string, string | null>): string {
  const preferred = Object.entries(row).find(([key, value]) =>
    Boolean(value && /industry.*name|description/i.test(key))
  )?.[1] ?? Object.values(row).find((value) => Boolean(value && /[A-Za-z]/.test(value)));
  const fallback = Object.values(row).filter(Boolean).join(" ");
  return (preferred ?? fallback).replace(/\s+-\s+\d{1,3}\s*$/, "").trim();
}

export async function GET() {
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
    const rows = await listIndustries(creds);
    const parsed = rows
      .map((row) => ({ id: industryId(row), name: industryName(row), raw: row }))
      .filter((row): row is { id: string; name: string; raw: Record<string, string | null> } => Boolean(row.id))
      .sort((a, b) => Number(a.id) - Number(b.id));

    return NextResponse.json({
      ok: true,
      source_count: rows.length,
      rows: parsed,
    });
  } catch (err) {
    const message = err instanceof PcbError
      ? err.message
      : "FDA's Product Code Builder could not be reached.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
