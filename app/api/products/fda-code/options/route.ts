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

/**
 * The single character FDA uses for this element.
 *
 * Subclass and PIC are one character by definition, so the whole cell is the
 * code -- matching a character out of the middle of a longer string, as the
 * previous word-boundary pattern did, could lift a letter out of a name.
 * The key patterns are loose because FDA abbreviates its column names.
 */
function optionCode(row: Record<string, string | null>, kind: "subclass" | "pic"): string | null {
  const kindKey = kind === "subclass" ? /subcl/i : /pic/i;
  const isCode = (value: string | null) => Boolean(value && /^[A-Z0-9-]$/i.test(value.trim()));

  const preferred = Object.entries(row).find(([key, value]) =>
    Boolean((kindKey.test(key) || /^(code|id)$/i.test(key)) && isCode(value))
  )?.[1];
  const fallback = Object.values(row).find(isCode);
  return (preferred ?? fallback)?.trim().toUpperCase() ?? null;
}

/**
 * The readable name for an option, or null when FDA gave us nothing but the
 * code.
 *
 * FDA abbreviates: the description column is PICDESC or SUBCLSDESC, never
 * DESCRIPTION, so /(name|description)/ matched no column at all. The old
 * fallback then took the first value containing any letter -- which is the
 * one-character code itself -- and the dropdown rendered "G - G", naming
 * nothing.
 *
 * The length guard is what makes this hold whatever FDA calls the column: a
 * real name has two or more letters, a code never does. Returning null rather
 * than echoing the code lets the caller show a bare letter honestly instead
 * of dressing it up as its own description.
 */
function optionName(row: Record<string, string | null>, code: string | null): string | null {
  const labelled = Object.entries(row).find(([key, value]) =>
    Boolean(value && /(desc|name|title)/i.test(key) && value.trim().length > 1)
  )?.[1];
  const anyText = Object.values(row).find((value) => Boolean(value && /[A-Za-z]{2,}/.test(value.trim())));

  const name = (labelled ?? anyText ?? "").replace(/\s+-\s+[A-Z0-9-]\s*$/, "").trim();
  if (!name || name.toUpperCase() === code?.toUpperCase()) return null;
  return name;
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
    const subclasses = subclassRows.map((row) => shape(row, "subclass")).filter(Boolean);
    const pics = picRows.map((row) => shape(row, "pic")).filter(Boolean);

    return NextResponse.json({
      ok: true,
      subclasses,
      pics,
      // Diagnostics. FDA does not document these tables' column names and they
      // differ per table, so when nothing shapes, the raw rows are the only
      // way to see why -- the same panel that identified PRODCLASS and
      // GROUPCODE on the product step. Counts distinguish "FDA sent nothing"
      // from "FDA sent rows we could not read", which are different faults.
      source: {
        subclass_rows: subclassRows.length,
        pic_rows: picRows.length,
        sample_subclass: subclassRows.slice(0, 3),
        sample_pic: picRows.slice(0, 3),
      },
    });
  } catch (err) {
    const message = err instanceof PcbError
      ? err.message
      : "FDA's Product Code Builder could not be reached.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
