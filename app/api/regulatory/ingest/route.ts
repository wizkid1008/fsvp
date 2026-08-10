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
import { runFoodEnforcementIngest } from "@/lib/regulatory/ingest";

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

  const result = await runFoodEnforcementIngest(admin, {
    apiKey: process.env.OPENFDA_API_KEY?.trim() || undefined,
    triggeredByProfileId: user.id,
  });

  if (result.error) {
    return NextResponse.json(
      { ok: false, run_id: result.runId, error: result.error },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    run_id: result.runId,
    records_seen: result.recordsSeen,
    records_new: result.recordsNew,
    candidates_created: result.candidatesCreated,
  });
}
