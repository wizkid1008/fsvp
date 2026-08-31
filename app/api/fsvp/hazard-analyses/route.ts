import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const admin = createAdminSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  // See the note in hazard-items: a tenant-scoped reviewer is an FSVP qualified
  // individual, and the hazard analysis is their work product under § 1.503.
  if (!profile || !["us_importer", "administrator", "reviewer"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { fsvp_record_id } = body;
  if (!fsvp_record_id) return NextResponse.json({ error: "fsvp_record_id required" }, { status: 400 });

  // Verify this fsvp_record belongs to the importer
  const { data: record } = await (admin.from("fsvp_records") as any)
    .select("id, importer_id")
    .eq("id", fsvp_record_id)
    .maybeSingle();

  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  if (profile.role !== "administrator" && record.importer_id !== profile.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get next version number
  const { data: existing } = await (admin.from("fsvp_plan_hazard_analyses") as any)
    .select("version")
    .eq("fsvp_record_id", fsvp_record_id)
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = existing?.length > 0 ? existing[0].version + 1 : 1;

  const { data, error } = await (admin.from("fsvp_plan_hazard_analyses") as any).insert({
    fsvp_record_id,
    version: nextVersion,
    status: "draft",
    created_by_profile_id: user.id,
  }).select().maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/**
 * Finalize a hazard analysis, or reopen one to correct it.
 *
 * POST above only ever wrote status 'draft', and nothing anywhere wrote
 * 'final'. The product checklist reads exactly that column to decide whether
 * the Product Hazard Analysis requirement is met
 * (generatedStatusFor in components/evidence/RequiredEvidenceChecklist.tsx),
 * so the row could never leave "In Progress" however complete the analysis
 * was. The work had no end.
 *
 * Finalizing is deliberately NOT the qualified individual's signature. That is
 * a separate attestation in the same ledger as every other one
 * (app/api/fsvp/attestations), and the approve route refuses without it. This
 * says only that the author considers the analysis complete -- which is what
 * the checklist is asking about.
 *
 * Reopen exists because a hazard item cannot be edited, only added and removed.
 * Without it a single typo would strand the record with no way back.
 */
export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const admin = createAdminSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  // Same authorship rule as POST: the analysis is the QI's work product, and a
  // tenant-scoped reviewer is how a QI holds a login.
  if (!profile || !["us_importer", "administrator", "reviewer"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const hazardAnalysisId = typeof body.hazard_analysis_id === "string" ? body.hazard_analysis_id.trim() : "";
  const action = body.action === "reopen" ? "reopen" : "finalize";

  if (!hazardAnalysisId) {
    return NextResponse.json({ error: "hazard_analysis_id required" }, { status: 400 });
  }

  const { data: analysis } = await (admin.from("fsvp_plan_hazard_analyses") as any)
    .select("id, status, version, fsvp_record_id, fsvp_records!inner(importer_id, status)")
    .eq("id", hazardAnalysisId)
    .maybeSingle();

  if (!analysis) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });

  const record = analysis.fsvp_records as { importer_id: string; status: string };
  if (profile.role !== "administrator" && record.importer_id !== profile.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Mirrors isEditable on the record page: a decided record is not redrafted,
  // it is reassessed (see components/fsvp/ReassessmentSection.tsx).
  if (["importer_approved", "rejected"].includes(record.status)) {
    return NextResponse.json(
      { error: "This FSVP record has already been decided. Begin a reassessment to change its hazard analysis." },
      { status: 409 }
    );
  }

  if (analysis.status === "superseded") {
    return NextResponse.json(
      { error: "This version has been superseded by a later hazard analysis." },
      { status: 409 }
    );
  }

  if (action === "reopen") {
    if (analysis.status !== "final") {
      return NextResponse.json({ error: "This hazard analysis is already a draft." }, { status: 409 });
    }

    const { error } = await (admin.from("fsvp_plan_hazard_analyses") as any)
      .update({
        status:            "draft",
        performed_by_name: null,
        performed_at:      null,
        updated_at:        new Date().toISOString(),
      })
      .eq("id", hazardAnalysisId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await (admin.from("audit_logs") as any).insert({
      importer_id:      record.importer_id,
      actor_profile_id: user.id,
      actor_role:       profile.role,
      action:           "hazard_analysis_reopened",
      record_type:      "fsvp_plan_hazard_analyses",
      record_id:        hazardAnalysisId,
      previous_value:   { status: "final" },
      new_value:        { status: "draft", fsvp_record_id: analysis.fsvp_record_id },
    });

    return NextResponse.json({ ok: true, status: "draft" });
  }

  if (analysis.status === "final") {
    return NextResponse.json({ error: "This hazard analysis is already final." }, { status: 409 });
  }

  // § 1.504 asks what the known or reasonably foreseeable hazards are. An
  // analysis naming none has not answered that -- it has skipped it. The
  // checklist's "Known / Reasonably Foreseeable Hazard List" row reads the same
  // count, so allowing this would mark that requirement met with nothing behind it.
  const { count } = await (admin.from("fsvp_plan_hazard_items") as any)
    .select("id", { count: "exact", head: true })
    .eq("hazard_analysis_id", hazardAnalysisId);

  if (!count || count === 0) {
    return NextResponse.json(
      { error: "Add at least one known or reasonably foreseeable hazard before marking this analysis final." },
      { status: 400 }
    );
  }

  const { error } = await (admin.from("fsvp_plan_hazard_analyses") as any)
    .update({
      status:            "final",
      performed_by_name: profile.full_name ?? profile.email,
      performed_at:      new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    })
    .eq("id", hazardAnalysisId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      record.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "hazard_analysis_finalized",
    record_type:      "fsvp_plan_hazard_analyses",
    record_id:        hazardAnalysisId,
    previous_value:   { status: "draft" },
    new_value:        {
      status:           "final",
      version:          analysis.version,
      hazard_count:     count,
      fsvp_record_id:   analysis.fsvp_record_id,
    },
  });

  return NextResponse.json({ ok: true, status: "final", hazard_count: count });
}
