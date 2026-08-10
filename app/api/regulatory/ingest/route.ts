// POST — refresh what FDA has published, and propose who it concerns.
//
// Platform-level rather than tenant-level: regulatory_events holds public facts
// about firms, not one importer's data, so one refresh serves every tenant.
// Only a platform administrator may trigger it. Tenants consume the result
// through /compliance-history and decide for themselves what it means.
//
// The route reports what happened rather than throwing: a failed ingest is
// recorded on the run row with its error, because "we tried and FDA was down"
// is information a compliance screen needs, and a silent failure would let the
// screen imply freshness it does not have.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { runAllIngests } from "@/lib/regulatory/ingest";

export const runtime = "edge";

export async function POST(_req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "administrator") {
    return NextResponse.json(
      { error: "Only a platform administrator can refresh the FDA compliance data." },
      { status: 403 }
    );
  }

  const admin = createAdminSupabaseClient();

  // Every source this deployment can reach. Sources without credentials are
  // skipped rather than attempted, so they stay visibly "never refreshed"
  // instead of accumulating failed runs that look like an outage.
  const results = await runAllIngests(admin, { triggeredByProfileId: user.id });

  const failed = results.filter((r) => r.error);

  return NextResponse.json(
    {
      // Partial success is the normal case while only some sources are
      // configured, so `ok` means "nothing failed", not "everything ran".
      ok: failed.length === 0,
      sources: results.map((r) => ({
        source:             r.source,
        run_id:             r.runId,
        records_seen:       r.recordsSeen,
        records_new:        r.recordsNew,
        candidates_created: r.candidatesCreated,
        error:              r.error ?? null,
      })),
      records_seen:       results.reduce((n, r) => n + r.recordsSeen, 0),
      records_new:        results.reduce((n, r) => n + r.recordsNew, 0),
      candidates_created: results.reduce((n, r) => n + r.candidatesCreated, 0),
      error: failed.length > 0
        ? `${failed.length} of ${results.length} sources failed: ` +
          failed.map((f) => `${f.source} — ${f.error}`).join("; ")
        : null,
    },
    // 207-style semantics without the ceremony: a failure is reported with the
    // successes beside it, because "recalls refreshed, refusals did not" is
    // more useful than a bare 502.
    { status: failed.length === results.length ? 502 : 200 }
  );
}
