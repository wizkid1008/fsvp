// GET ?industry=NN — list FDA subclass/container and PIC/process options for
// a selected Product Code Builder industry.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  listPics,
  listPicsForIndustry,
  listSubclasses,
  listSubclassesForIndustry,
  pcbCredentialsFromEnv,
  PcbError,
  type PcbRow,
} from "@/lib/regulatory/product-code-builder";
import { shapeOption } from "@/lib/regulatory/pcb-options";

export const runtime = "edge";

type TableResult = {
  rows: PcbRow[];
  scope: "industry" | "global";
  error: string | null;
};

/**
 * An FDA reference table, industry-scoped when that works and unfiltered when
 * it does not.
 *
 * The scoped endpoints were previously judged undependable -- both dropdowns
 * came back empty, and /productcodeindustry/{id} was removed in 6b0985d for
 * the same reason. That verdict was wrong about FDA and right about us: the
 * industry id was being passed through Number(), so "02" went out as 2 and
 * FDA was being asked for an industry that does not exist. The id is now sent
 * exactly as FDA gave it.
 *
 * The fallback stays anyway. /subclass and /pic are the same taxonomy
 * unfiltered, so a handful of options that do not apply to this industry is a
 * far smaller fault than a control with nothing in it, and the code the user
 * finally records is verified against FDA either way -- a slightly wide list
 * cannot make a wrong code look right.
 *
 * Never rejects. Which table answered, and why the first did not, come back as
 * data so the card can say so.
 */
async function tableWithFallback(
  scoped: () => Promise<PcbRow[]>,
  unfiltered: () => Promise<PcbRow[]>
): Promise<TableResult> {
  const describe = (err: unknown) =>
    err instanceof PcbError ? err.message : "FDA could not be reached.";

  let scopedError: string | null = null;
  try {
    const rows = await scoped();
    if (rows.length > 0) return { rows, scope: "industry", error: null };
    scopedError = "FDA returned no industry-scoped rows for this table.";
  } catch (err) {
    scopedError = describe(err);
  }

  try {
    const rows = await unfiltered();
    return { rows, scope: "global", error: rows.length > 0 ? null : scopedError };
  } catch (err) {
    return {
      rows: [],
      scope: "global",
      error: [scopedError, describe(err)].filter(Boolean).join(" "),
    };
  }
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
    // tableWithFallback never rejects, so one table cannot erase the other --
    // Promise.all previously threw the whole request when either endpoint
    // failed, emptying both dropdowns at once.
    const [subclassTable, picTable] = await Promise.all([
      tableWithFallback(
        () => listSubclassesForIndustry(industry, creds),
        () => listSubclasses(creds)
      ),
      tableWithFallback(
        () => listPicsForIndustry(industry, creds),
        () => listPics(creds)
      ),
    ]);

    const subclasses = subclassTable.rows.map((row) => shapeOption(row, "subclass")).filter(Boolean);
    const pics = picTable.rows.map((row) => shapeOption(row, "pic")).filter(Boolean);

    return NextResponse.json({
      ok: true,
      subclasses,
      pics,
      // Diagnostics. FDA does not document these tables' column names and they
      // differ per table, so when nothing shapes, the raw rows are the only way
      // to see why -- the same panel that identified PRODCLASS and GROUPCODE on
      // the product step. The counts and scope separate three different faults:
      // FDA sent nothing, FDA sent rows we could not read, or FDA refused.
      source: {
        subclass_rows: subclassTable.rows.length,
        pic_rows: picTable.rows.length,
        subclass_scope: subclassTable.scope,
        pic_scope: picTable.scope,
        subclass_error: subclassTable.error,
        pic_error: picTable.error,
        sample_subclass: subclassTable.rows.slice(0, 3),
        sample_pic: picTable.rows.slice(0, 3),
      },
    });
  } catch (err) {
    // tableWithFallback is documented never to reject, so anything reaching
    // here came from outside it and used to surface as a bare 500 -- an edge
    // runtime "Internal Server Error" with no body, which says nothing about
    // whether FDA refused, sent something unreadable, or the worker gave up.
    // The route depends on an external API whose responses are undocumented,
    // so it has to be able to report its own failure.
    return NextResponse.json(
      {
        error: "FDA's subclass and PIC tables could not be read.",
        detail: err instanceof Error ? err.message : String(err),
        industry,
      },
      { status: 502 }
    );
  }
}
