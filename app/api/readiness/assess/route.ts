// POST { supplier_id }
// Creates a readiness assessment by scoring all FSVP records for the supplier.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { scoreFsvpRecord } from "@/lib/scoring";

export const runtime = "edge";

const ALLOWED_ROLES = new Set(["us_importer", "reviewer", "administrator"]);

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.has(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { supplier_id } = body as { supplier_id: string };

  if (!supplier_id) {
    return NextResponse.json({ error: "supplier_id is required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // Fetch all FSVP records for this importer + supplier
  const { data: records } = await (admin.from("fsvp_records") as any)
    .select("id, facility_id, product_id, rule_version_id, status")
    .eq("importer_id", profile.importer_id)
    .eq("supplier_id", supplier_id)
    .not("rule_version_id", "is", null);

  const fsvpRecords = (records ?? []) as Array<{
    id: string;
    facility_id: string;
    product_id: string;
    rule_version_id: string;
    status: string;
  }>;

  // Score each record
  const scoreResults = await Promise.allSettled(
    fsvpRecords.map((r) =>
      scoreFsvpRecord(r.id, r.facility_id, r.product_id, r.rule_version_id)
    )
  );

  const successfulScores = scoreResults
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof scoreFsvpRecord>>> => r.status === "fulfilled")
    .map((r) => r.value);

  const overall_score =
    successfulScores.length > 0
      ? Math.round((successfulScores.reduce((sum, s) => sum + s.overall_score, 0) / successfulScores.length) * 100) / 100
      : 0;

  const notApproved = successfulScores.filter((s) => s.approval_status !== "approved").length;
  const gap_summary =
    successfulScores.length === 0
      ? "No FSVP records found for this supplier."
      : notApproved === 0
      ? "All FSVP records are fully approved."
      : `${notApproved} of ${successfulScores.length} FSVP record(s) have unresolved gaps or are not yet approved.`;

  // Insert readiness assessment
  const { data: assessment, error: assessErr } = await (admin.from("readiness_assessments") as any)
    .insert({
      importer_id: profile.importer_id,
      supplier_id,
      status: "draft",
      overall_score,
      gap_summary,
    })
    .select("id")
    .single();

  if (assessErr) return NextResponse.json({ error: assessErr.message }, { status: 500 });

  // Upsert per-section readiness scores
  for (const scoreResult of successfulScores) {
    for (const [sectionKey, section] of Object.entries(scoreResult.section_scores)) {
      await (admin.from("readiness_scores") as any)
        .upsert(
          {
            importer_id: profile.importer_id,
            assessment_id: assessment.id,
            category: sectionKey,
            score: section.raw_score,
            gap_summary: section.raw_score < 100 ? `${section.section_name}: ${Math.round(section.raw_score)}% complete` : null,
          },
          { onConflict: "assessment_id,category" }
        );
    }
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id: profile.importer_id,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: "readiness_assessment_created",
    record_type: "readiness_assessments",
    record_id: assessment.id,
    new_value: { supplier_id, overall_score },
  });

  return NextResponse.json({ id: assessment.id, overall_score });
}
