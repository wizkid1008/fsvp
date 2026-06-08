// POST { decision, decision_notes?, conditions_text? }
// Importer makes final approval decision on an FSVP record.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

type Decision = "approved" | "conditionally_approved" | "rejected" | "revision_requested";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["us_importer", "administrator"].includes(profile.role)) {
    return NextResponse.json({ error: "Only importers can make approval decisions." }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const { id } = params;

  const { data: record } = await (admin.from("fsvp_records") as any)
    .select("importer_id, rule_version_id, status, supplier_id, facility_id, product_id")
    .eq("id", id)
    .maybeSingle();

  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  if (record.importer_id !== profile.importer_id && profile.role !== "administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { decision, decision_notes, conditions_text, reassessment_months } = body as {
    decision: Decision;
    decision_notes?: string;
    conditions_text?: string;
    reassessment_months?: number;
  };

  const validDecisions: Decision[] = ["approved", "conditionally_approved", "rejected", "revision_requested"];
  if (!decision || !validDecisions.includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const now = new Date();
  const months = reassessment_months ?? 12;
  const reassessmentDue = new Date(now);
  reassessmentDue.setMonth(reassessmentDue.getMonth() + months);

  // Map decision to record status
  const statusMap: Record<Decision, string> = {
    approved: "importer_approved",
    conditionally_approved: "conditionally_approved",
    rejected: "rejected",
    revision_requested: "needs_corrective_action",
  };

  await (admin.from("fsvp_records") as any)
    .update({
      approval_decision: decision === "revision_requested" ? null : decision,
      approved_by_profile_id: user.id,
      approved_at: decision !== "revision_requested" ? now.toISOString() : null,
      reassessment_due_at: reassessmentDue.toISOString(),
      status: statusMap[decision],
    })
    .eq("id", id);

  // Record in approval_decisions history
  await (admin.from("approval_decisions") as any).insert({
    fsvp_record_id: id,
    importer_id: record.importer_id,
    decision,
    decision_notes: decision_notes ?? null,
    conditions_text: conditions_text ?? null,
    decided_by_profile_id: user.id,
    rule_version_id: record.rule_version_id,
  });

  // Create/update reassessment schedule for approved/conditional
  if (decision === "approved" || decision === "conditionally_approved") {
    const { data: existingSchedule } = await (admin.from("reassessment_schedules") as any)
      .select("id")
      .eq("fsvp_record_id", id)
      .maybeSingle();

    if (existingSchedule) {
      await (admin.from("reassessment_schedules") as any)
        .update({
          frequency_months: months,
          last_assessed_at: now.toISOString(),
          next_due_at: reassessmentDue.toISOString(),
          status: "scheduled",
        })
        .eq("id", existingSchedule.id);
    } else {
      await (admin.from("reassessment_schedules") as any).insert({
        fsvp_record_id: id,
        importer_id: record.importer_id,
        frequency_months: months,
        last_assessed_at: now.toISOString(),
        next_due_at: reassessmentDue.toISOString(),
        status: "scheduled",
      });
    }
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id: record.importer_id,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: `fsvp_record_${decision}`,
    record_type: "fsvp_records",
    record_id: id,
    new_value: { decision, decision_notes, conditions_text },
  });

  return NextResponse.json({ success: true, status: statusMap[decision] });
}
