// POST { schedule_id, findings, changes_required, changes_description, performed_at }
// Records a completed FSVP reassessment and advances the schedule.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

const ALLOWED_ROLES = new Set(["us_importer", "reviewer", "administrator"]);

function addMonths(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + n);
  return d.toISOString();
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
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
  const { schedule_id, findings, changes_required, changes_description, performed_at } = body as {
    schedule_id: string;
    findings?: string;
    changes_required?: boolean;
    changes_description?: string;
    performed_at: string;
  };

  if (!schedule_id || !performed_at) {
    return NextResponse.json({ error: "schedule_id and performed_at required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // Verify the FSVP record belongs to this importer
  const { data: record } = await (admin.from("fsvp_records") as any)
    .select("id, importer_id, supplier_id")
    .eq("id", id)
    .maybeSingle();

  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  if (profile.role === "us_importer" && record.importer_id !== profile.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch the schedule
  const { data: schedule } = await (admin.from("reassessment_schedules") as any)
    .select("id, fsvp_record_id, frequency_months")
    .eq("id", schedule_id)
    .eq("fsvp_record_id", id)
    .maybeSingle();

  if (!schedule) return NextResponse.json({ error: "Schedule not found" }, { status: 404 });

  const nextDue = addMonths(performed_at, schedule.frequency_months);
  const changesText = changes_required && changes_description ? changes_description : null;

  // Insert reassessment record
  const { data: reassessment, error: insertErr } = await (admin.from("fsvp_reassessments") as any)
    .insert({
      importer_id: record.importer_id,
      scope: "full_program",
      target_supplier_id: record.supplier_id,
      triggered_by: "scheduled_3yr",
      findings: findings ?? null,
      changes_required: changesText,
      performed_at: new Date(performed_at).toISOString(),
      next_reassessment_due_at: nextDue,
      status: "completed",
    })
    .select("id")
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Advance the schedule
  const { error: scheduleErr } = await (admin.from("reassessment_schedules") as any)
    .update({
      last_assessed_at: new Date(performed_at).toISOString(),
      next_due_at: nextDue,
      status: "scheduled",
    })
    .eq("id", schedule_id);

  if (scheduleErr) return NextResponse.json({ error: scheduleErr.message }, { status: 500 });

  // If changes are required, flag the FSVP record
  if (changes_required) {
    await (admin.from("fsvp_records") as any)
      .update({ status: "needs_corrective_action" })
      .eq("id", id);
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id: record.importer_id,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: "reassessment_completed",
    record_type: "fsvp_reassessments",
    record_id: reassessment.id,
    new_value: { performed_at, changes_required, next_due_at: nextDue },
  });

  return NextResponse.json({ id: reassessment.id });
}
