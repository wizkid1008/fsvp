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
  // individual, and the verification activities determination is theirs to make
  // under § 1.506.
  if (!profile || !["us_importer", "administrator", "reviewer"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    fsvp_record_id, activity_type, scheduled_date,
    performed_by_name, next_due_at, is_sahcodha_audit, result_notes,
  } = body;

  if (!fsvp_record_id || !activity_type) {
    return NextResponse.json({ error: "fsvp_record_id and activity_type required" }, { status: 400 });
  }

  const { data: record } = await (admin.from("fsvp_records") as any)
    .select("id, importer_id")
    .eq("id", fsvp_record_id)
    .maybeSingle();

  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  if (profile.role !== "administrator" && record.importer_id !== profile.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await (admin.from("fsvp_verification_records") as any).insert({
    fsvp_record_id,
    activity_type,
    scheduled_date: scheduled_date ?? null,
    performed_by_name: performed_by_name ?? null,
    next_due_at: next_due_at ?? null,
    is_sahcodha_audit: is_sahcodha_audit ?? false,
    result_notes: result_notes ?? null,
    status: "planned",
    created_by_profile_id: user.id,
  }).select().maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

const ACTIVITY_TYPES = [
  "onsite_audit", "sampling_testing", "records_review",
  "certificate_of_conformance", "written_assurance", "other",
];
const RESULTS = ["acceptable", "unacceptable", "inconclusive", "pending"];
const STATUSES = ["planned", "in_progress", "completed", "overdue", "cancelled"];

type ActivityRow = {
  id: string;
  activity_type: string;
  status: string;
  result: string | null;
  completed_at: string | null;
  is_sahcodha_audit: boolean;
  fsvp_record_id: string;
  fsvp_records: { importer_id: string; status: string };
};

/**
 * Loads the activity plus its parent record's tenancy and decision status,
 * and applies the same edit gate PATCH and DELETE both need: wrong tenant, or
 * a record that has already been decided (mirrors isEditable on the record
 * page and the same rule hazard-analyses PATCH enforces).
 */
async function loadEditableActivity(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  id: string,
  profile: { role: string; importer_id: string | null }
): Promise<{ activity: ActivityRow | null; error: NextResponse | null }> {
  const { data: existing } = await (admin.from("fsvp_verification_records") as any)
    .select("id, activity_type, status, result, completed_at, is_sahcodha_audit, fsvp_record_id, fsvp_records!inner(importer_id, status)")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return { activity: null, error: NextResponse.json({ error: "Verification activity not found" }, { status: 404 }) };
  }

  const record = existing.fsvp_records as { importer_id: string; status: string };
  if (profile.role !== "administrator" && record.importer_id !== profile.importer_id) {
    return { activity: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (["importer_approved", "rejected"].includes(record.status)) {
    return {
      activity: null,
      error: NextResponse.json(
        { error: "This FSVP record has already been decided. Begin a reassessment to change its verification activities." },
        { status: 409 }
      ),
    };
  }

  return { activity: existing as ActivityRow, error: null };
}

/**
 * Edits a verification activity, or moves it through its status lifecycle.
 *
 * POST above only ever wrote status 'planned', and nothing anywhere wrote
 * anything else -- an on-site audit could be scheduled but never recorded as
 * done. This is what closes that: any of the activity's fields can be
 * updated, including status and result, so completing one is the same PATCH
 * as correcting a typo in who performed it.
 */
export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const admin = createAdminSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["us_importer", "administrator", "reviewer"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { activity, error: gateError } = await loadEditableActivity(admin, id, profile);
  if (gateError) return gateError;

  const updates: Record<string, unknown> = {};

  if (body.activity_type !== undefined) {
    if (!ACTIVITY_TYPES.includes(body.activity_type)) {
      return NextResponse.json({ error: "Invalid activity_type" }, { status: 400 });
    }
    updates.activity_type = body.activity_type;
  }
  if (body.scheduled_date !== undefined) updates.scheduled_date = body.scheduled_date || null;
  if (body.next_due_at !== undefined) updates.next_due_at = body.next_due_at || null;
  if (body.performed_by_name !== undefined) updates.performed_by_name = body.performed_by_name || null;
  if (body.result_notes !== undefined) updates.result_notes = body.result_notes || null;
  if (body.completed_at !== undefined) updates.completed_at = body.completed_at || null;
  if (body.is_sahcodha_audit !== undefined) updates.is_sahcodha_audit = Boolean(body.is_sahcodha_audit);
  if (body.result !== undefined) {
    if (body.result !== null && !RESULTS.includes(body.result)) {
      return NextResponse.json({ error: "Invalid result" }, { status: 400 });
    }
    updates.result = body.result || null;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = body.status;
  }

  // Same rule the add form states in its own checkbox label: a SAHCODHA audit
  // must be an on-site audit. Checked against whichever value -- new or
  // existing -- wins for each field, since either one alone can update.
  const finalType = (updates.activity_type as string | undefined) ?? activity!.activity_type;
  const finalSahcodha = (updates.is_sahcodha_audit as boolean | undefined) ?? activity!.is_sahcodha_audit;
  if (finalSahcodha && finalType !== "onsite_audit") {
    return NextResponse.json(
      { error: "A SAHCODHA audit (§ 1.506(b)(2)) must be an on-site audit." },
      { status: 400 }
    );
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No changes given." }, { status: 400 });
  }

  // Completing an activity without saying when is the same "no end" gap this
  // route exists to close -- default the timestamp rather than leave it null.
  if (updates.status === "completed" && !updates.completed_at && !activity!.completed_at) {
    updates.completed_at = new Date().toISOString();
  }

  const { data, error } = await (admin.from("fsvp_verification_records") as any)
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      activity!.fsvp_records.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "verification_record_updated",
    record_type:      "fsvp_verification_records",
    record_id:        id,
    previous_value:   {
      activity_type: activity!.activity_type, status: activity!.status,
      result: activity!.result, completed_at: activity!.completed_at,
    },
    new_value:        updates,
  });

  return NextResponse.json({ data });
}

/**
 * Removes a verification activity outright, for the case an edit cannot fix:
 * one added by mistake against the wrong record or the wrong supplier.
 * compliance_alerts.verification_record_id cascades, so an open reminder tied
 * to this activity goes with it rather than pointing at nothing.
 */
export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const admin = createAdminSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["us_importer", "administrator", "reviewer"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { activity, error: gateError } = await loadEditableActivity(admin, id, profile);
  if (gateError) return gateError;

  const { error } = await (admin.from("fsvp_verification_records") as any).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      activity!.fsvp_records.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "verification_record_deleted",
    record_type:      "fsvp_verification_records",
    record_id:        id,
    previous_value:   {
      activity_type: activity!.activity_type, status: activity!.status, result: activity!.result,
    },
    new_value:        null,
  });

  return NextResponse.json({ ok: true });
}
