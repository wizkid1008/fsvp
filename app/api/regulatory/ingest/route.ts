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
import { configuredSources, runSourceIngest } from "@/lib/regulatory/ingest";
import type { RegulatorySourceId } from "@/lib/regulatory/sources";

export const runtime = "edge";

export async function POST(req: NextRequest) {
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

  // ONE source per request, and one bounded window within it.
  //
  // The first version refreshed all four sources across two years in a single
  // request and Cloudflare killed it — Error 1102, worker exceeded resource
  // limits, nothing written. A Worker has a fixed CPU and subrequest budget, so
  // the work has to be divided rather than merely made faster: dividing fails
  // gracefully as the dataset grows, optimising only postpones the same wall.
  const body = await req.json().catch(() => ({})) as { source?: string };
  const available = configuredSources();

  const source = available.includes(body.source as RegulatorySourceId)
    ? (body.source as RegulatorySourceId)
    : null;

  if (!source) {
    return NextResponse.json(
      {
        error: body.source
          ? `${body.source} is not a configured source. Available: ${available.join(", ")}.`
          : "Name the source to refresh.",
        available,
      },
      { status: 400 }
    );
  }

  const result = await runSourceIngest(admin, source, { triggeredByProfileId: user.id });

  if (result.error) {
    return NextResponse.json(
      { ok: false, source, run_id: result.runId, error: result.error },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    source,
    run_id:             result.runId,
    records_seen:       result.recordsSeen,
    records_new:        result.recordsNew,
    candidates_created: result.candidatesCreated,
    window_from:        result.windowFrom,
    window_to:          result.windowTo,
    // False means the window stopped short of today. The caller repeats until
    // this is true — that is what makes a two-year backfill possible inside a
    // request budget that cannot hold it in one go.
    caught_up:          result.caughtUp,
  });
}
