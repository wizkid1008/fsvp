// GET ?industry=NN — list FDA subclass/container and PIC/process options for
// a selected Product Code Builder industry.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  listPicsForIndustry,
  listSubclassesForIndustry,
  pcbCredentialsFromEnv,
  PcbError,
} from "@/lib/regulatory/product-code-builder";

export const runtime = "edge";

function optionCode(row: Record<string, string | null>, kind: "subclass" | "pic"): string | null {
  const preferred = Object.entries(row).find(([key, value]) =>
    Boolean(value && new RegExp(`${kind}.*(code|id)|^code$|^id$`, "i").test(key) && /^[A-Z0-9-]$/.test(value))
  )?.[1];
  const fallback = Object.values(row).find((value) => Boolean(value && /\b[A-Z0-9-]\b/.test(value)));
  return (preferred ?? fallback)?.match(/\b[A-Z0-9-]\b/)?.[0]?.toUpperCase() ?? null;
}

function optionName(row: Record<string, string | null>, code: string | null): string {
  const preferred = Object.entries(row).find(([key, value]) =>
    Boolean(value && /(name|description)/i.test(key))
  )?.[1] ?? Object.values(row).find((value) => Boolean(value && /[A-Za-z]/.test(value)));
  return (preferred ?? code ?? "Option").replace(/\s+-\s+[A-Z0-9-]\s*$/, "").trim();
}

function shape(row: Record<string, string | null>, kind: "subclass" | "pic") {
  const code = optionCode(row, kind);
  if (!code) return null;
  return { code, name: optionName(row, code), raw: row };
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

  const creds = pcbCredentialsFromEnv();
  if (!creds) {
    return NextResponse.json(
      { error: "The FDA Product Code Builder integration is not configured." },
      { status: 503 }
    );
  }

  try {
    const [subclassRows, picRows] = await Promise.all([
      listSubclassesForIndustry(Number(industry), creds),
      listPicsForIndustry(Number(industry), creds),
    ]);
    return NextResponse.json({
      ok: true,
      subclasses: subclassRows.map((row) => shape(row, "subclass")).filter(Boolean),
      pics: picRows.map((row) => shape(row, "pic")).filter(Boolean),
    });
  } catch (err) {
    const message = err instanceof PcbError
      ? err.message
      : "FDA's Product Code Builder could not be reached.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
