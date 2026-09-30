// POST — submit an FSVP record for the importer's approval decision.
//
// Moves the record to importer_review_pending, the status the records list,
// dashboard and stage summaries already read as "waiting on the importer" but
// which nothing used to set. Whoever prepared the record — the importer's own
// users, a tenant reviewer (how a QI holds a login), or an administrator —
// may submit it. The decision itself stays with /approve.
//
// A record may be submitted with gaps. Whatever lib/fsvp/approval-readiness.ts
// still lists is returned and written to the audit row, so the importer sees
// what is open; /approve refuses an approval on the same list, leaving them
// only reject or request a revision until it clears.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { approvalBlockers } from "@/lib/fsvp/approval-readiness";

export const runtime = "edge";

/** Statuses a record can be submitted from: prepared, but not yet decided. */
const SUBMITTABLE = new Set([
  "draft",
  "awaiting_supplier_evidence",
  "supplier_evidence_submitted",
  "supplier_evidence_accepted",
  "needs_corrective_action",
]);

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["us_importer", "reviewer", "administrator"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const { id } = params;

  const { data: record } = await (admin.from("fsvp_records") as any)
    .select(
      "id, importer_id, supplier_id, product_id, status, " +
      "hazard_analysis_notes, supplier_evaluation_notes, verification_determination"
    )
    .eq("id", id)
    .maybeSingle();

  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  // The admin client bypasses RLS, so tenancy is re-applied by hand. A
  // platform reviewer has no importer_id and fails this.
  if (profile.role !== "administrator" && record.importer_id !== profile.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (record.status === "importer_review_pending") {
    return NextResponse.json({ error: "This record is already waiting on the importer's decision." }, { status: 409 });
  }
  if (!SUBMITTABLE.has(record.status)) {
    return NextResponse.json(
      { error: "This record has already been decided. Begin a reassessment to change it." },
      { status: 409 }
    );
  }

  const openItems = await approvalBlockers(admin, record);

  const { error } = await (admin.from("fsvp_records") as any)
    .update({ status: "importer_review_pending" })
    .eq("id", id)
    .eq("status", record.status);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      record.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "fsvp_record_submitted",
    record_type:      "fsvp_records",
    record_id:        id,
    previous_value:   { status: record.status },
    new_value:        { status: "importer_review_pending", open_items: openItems },
  });

  return NextResponse.json({ ok: true, status: "importer_review_pending", open_items: openItems });
}
