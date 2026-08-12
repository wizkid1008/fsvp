// POST — confirm a country-commodity rule against its source.
//
// This is the step that turns a transcription into something the platform will
// assert. Until it happens the rule is a draft: visible, and unable to support
// a determination.
//
// Two things the database also enforces, checked here so the API can explain
// them rather than surfacing a raised exception:
//
//   - The verifier must not be the person who entered the rule. Not because
//     anyone is suspected, but because a mistyped treatment schedule is
//     invisible to whoever mistyped it.
//   - `verified_against` must say what was actually consulted. "ACIR, mango
//     from Mexico, retrieved 2026-08-11" is a checkable claim; "verified" is
//     not, and a verification nobody can retrace is not worth recording.
//
// Verifying also clears `source_changed_at` and restarts the review clock: the
// point of confirming is that somebody has just looked.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

/** How long a fresh verification stands before it needs re-checking. */
const REVIEW_INTERVAL_DAYS = 365;

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // The reference layer is global. Until the roadmap's regulatory_administrator
  // role exists, platform administrators maintain it.
  if (profile?.role !== "administrator") {
    return NextResponse.json(
      { error: "Only a platform administrator can verify reference rules." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({})) as {
    rule_id?: string;
    verified_against?: string;
    review_interval_days?: number;
  };

  const ruleId = body.rule_id?.trim() ?? "";
  const against = body.verified_against?.trim() ?? "";

  if (!ruleId) return NextResponse.json({ error: "Which rule is being verified?" }, { status: 400 });

  if (against.length < 3) {
    return NextResponse.json(
      {
        error:
          "Record what you consulted — the database, the page, and the date. A verification nobody " +
          "can retrace is not worth recording.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();

  const { data: rule } = await (admin.from("country_commodity_rules") as any)
    .select("id, citation, created_by_profile_id, verification_status, superseded_at")
    .eq("id", ruleId)
    .maybeSingle();

  if (!rule) return NextResponse.json({ error: "That rule no longer exists." }, { status: 404 });

  if (rule.superseded_at) {
    return NextResponse.json(
      { error: "That rule has been superseded. Verify the row that replaced it." },
      { status: 409 }
    );
  }

  if (rule.created_by_profile_id && rule.created_by_profile_id === user.id) {
    return NextResponse.json(
      {
        error:
          "A rule has to be verified by someone other than the person who entered it. " +
          "Transcription errors are invisible to whoever made them — ask a colleague to check this one.",
      },
      { status: 409 }
    );
  }

  const days = Number.isFinite(body.review_interval_days) && body.review_interval_days! > 0
    ? Math.min(body.review_interval_days!, 730)
    : REVIEW_INTERVAL_DAYS;

  const todayIso = new Date().toISOString().slice(0, 10);
  const reviewDue = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  const { error } = await (admin.from("country_commodity_rules") as any)
    .update({
      verification_status:    "verified",
      verified_by_profile_id: user.id,
      verified_at:            todayIso,
      verified_against:       against,
      reviewed_at:            todayIso,
      reviewed_by_profile_id: user.id,
      review_due_at:          reviewDue,
      // Somebody has just looked, so whatever change detection flagged has now
      // been accounted for.
      source_changed_at:      null,
    })
    .eq("id", ruleId)
    .is("superseded_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      null,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "reference_rule_verified",
    record_type:      "country_commodity_rules",
    record_id:        ruleId,
    previous_value:   { verification_status: rule.verification_status },
    new_value:        {
      verification_status: "verified",
      verified_against: against,
      citation: rule.citation,
      review_due_at: reviewDue,
    },
  });

  return NextResponse.json({ ok: true, id: ruleId, review_due_at: reviewDue });
}
