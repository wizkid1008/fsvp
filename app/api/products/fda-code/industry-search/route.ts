// GET ?industry=NN&filter= — browse FDA Product Code Builder products in one
// industry, with an optional local text filter.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  listProducts,
  listProductsForIndustry,
  pcbCredentialsFromEnv,
  PcbError,
  searchProductsByName,
  type PcbCredentials,
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

function rowKey(row: Record<string, string | null>): string {
  const productish = Object.entries(row).find(([key, value]) =>
    Boolean(value && /(product.*id|product.*code|product.*name|name|description)/i.test(key))
  )?.[1];
  return productish ?? JSON.stringify(row);
}

function dedupe(rows: Record<string, string | null>[]): Record<string, string | null>[] {
  const byKey = new Map<string, Record<string, string | null>>();
  for (const row of rows) {
    const key = rowKey(row);
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

/**
 * The industry-scoped product table, same as it was, plus one thing it never
 * had: a way out when that table does not contain the product being looked
 * for.
 *
 * /industryproduct/{id} is scoped by FDA to one industry, and there is no
 * reason to expect it is exhaustive for that industry the way FDA's own
 * subclass/PIC tables turned out not to be (see the fallback in
 * options/route.ts). A garlic bulb typed into the filter can come back empty
 * against a canned-vegetables industry's product list without that meaning
 * garlic has no FDA code anywhere -- it may sit under a different industry,
 * or under this one in a row the scoped endpoint dropped.
 *
 * So when the filter finds nothing in-industry, this reaches for FDA's name
 * search across every industry instead of only ever re-showing the same
 * industry's other rows. Reached only on an actual filter: with no filter
 * typed, "browse this industry" means this industry, and pulling FDA's
 * entire product table just to show fifty of them would be a bad trade.
 */
async function productsWithFallback(
  industry: string,
  filter: string,
  creds: PcbCredentials
): Promise<{ rows: Record<string, string | null>[]; scope: "industry" | "global"; error: string | null }> {
  let scopedError: string | null = null;
  let scopedRows: Record<string, string | null>[] = [];
  try {
    scopedRows = dedupe((await listProductsForIndustry(industry, creds)).map(normalizeRow));
  } catch (err) {
    scopedError = err instanceof PcbError ? err.message : "FDA could not be reached.";
  }

  const scopedMatch = scopedRows.filter((row) => matchesAll(row, filter));
  if (scopedMatch.length > 0 || !filter) {
    return { rows: scopedRows, scope: "industry", error: scopedError };
  }

  // The industry-scoped list had nothing for this filter (or failed outright).
  // A name search is a far smaller pull than the full /product table, so
  // prefer it whenever there is a filter to search by.
  try {
    const globalRows = dedupe((await searchProductsByName(filter, creds)).map(normalizeRow));
    if (globalRows.length > 0) return { rows: globalRows, scope: "global", error: null };
  } catch {
    // Name search failing is not fatal -- fall through to the broader table.
  }

  try {
    const globalRows = dedupe((await listProducts(creds)).map(normalizeRow));
    return { rows: globalRows, scope: "global", error: scopedError };
  } catch (err) {
    // Both the scoped table and every global fallback came up short. Return
    // what the scoped call gave us (possibly nothing) rather than erroring
    // the whole request -- the caller already knows how to report "no rows".
    return {
      rows: scopedRows,
      scope: "industry",
      error: scopedError ?? (err instanceof PcbError ? err.message : "FDA could not be reached."),
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
    const { rows, scope, error: fallbackError } = await productsWithFallback(industry, filter, creds);

    const exact = rows.filter((row) => matchesAll(row, filter));
    // With no filter, matchesAny is unconditionally true, so `loose` is just
    // `rows` -- the ordinary browse case, not a fallback.
    const loose = exact.length > 0 ? exact : rows.filter((row) => matchesAny(row, filter));

    // MAX_ROWS caps an actual match set, which realistically never gets near
    // 50. It must NOT cap a "found nothing" case by silently substituting an
    // arbitrary slice of unrelated rows -- that is indistinguishable from the
    // product simply not existing, which is exactly how garlic went missing.
    // A real filter with nothing behind it, even loosely, gets an empty
    // result and an honest note instead.
    const noMatch = filter.length > 0 && loose.length === 0;
    const filtered = noMatch ? [] : loose;

    return NextResponse.json({
      ok: true,
      industry,
      filter,
      // "fallback" means "no exact match, showing broader results" -- true
      // for a loose match (same or global scope) and false once there is
      // nothing left to show at all (noMatch handles that case on its own).
      fallback: filter.length > 0 && exact.length === 0 && !noMatch,
      noMatch,
      scope,
      source_count: rows.length,
      total: filtered.length,
      truncated: filtered.length > MAX_ROWS,
      rows: filtered.slice(0, MAX_ROWS),
      source_error: fallbackError,
    });
  } catch (err) {
    const message = err instanceof PcbError
      ? err.message
      : "FDA's Product Code Builder could not be reached.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
