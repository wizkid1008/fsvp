// POST — a person decides whether an FDA record really is about their supplier.
//
// This is the gate the whole feature turns on. Matching proposes on name and
// country, which is a resemblance and not an identification (see
// lib/regulatory/matching.ts). Nothing proposed counts anywhere — not in the
// compliance history, not in a screening, not in the inspection package — until
// somebody confirms it here.
//
// Both answers are recorded. A rejection is as much a part of the compliance
// story as a confirmation: it says the importer looked at an FDA record naming
// a similar firm and determined it was not theirs, which is exactly the
// diligence § 1.505(a)(1)(iv) asks for.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { deniesTenant } from "@/lib/auth/tenancy";
import { refusePreviewWrite } from "@/lib/auth/preview-guard";
import { notify } from "@/lib/notifications/notify";
import { findingSeverity, EVENT_TYPE_LABEL, type RegulatoryEventType } from "@/lib/regulatory/sources";

export const runtime = "edge";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Your profile is not set up." }, { status: 403 });

  // An administrator previewing a tenant may read this queue but must not
  // decide in the tenant's name — the decision is attributed to whoever made it.
  const previewRefusal = refusePreviewWrite(profile.role, "confirm FDA compliance findings");
  if (previewRefusal) return previewRefusal;

  const body = await req.json().catch(() => ({})) as {
    decision?: string;
    notes?: string;
  };

  const decision = body.decision === "confirmed" ? "confirmed"
                 : body.decision === "rejected"  ? "rejected"
                 : null;

  if (!decision) {
    return NextResponse.json(
      { error: "Decide whether this FDA record is about your supplier: confirmed or rejected." },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();

  const { data: row } = await (admin.from("supplier_compliance_history") as any)
    .select("id, importer_id, supplier_id, facility_id, match_status, regulatory_event_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "That finding no longer exists." }, { status: 404 });

  if (deniesTenant(profile, row.importer_id)) {
    return NextResponse.json({ error: "That finding belongs to another organization." }, { status: 403 });
  }

  if (row.match_status !== "candidate") {
    return NextResponse.json(
      {
        error:
          `This finding was already ${row.match_status}. Reopening a decided match would ` +
          "rewrite the compliance record; record a new screening instead.",
      },
      { status: 409 }
    );
  }

  const { data: event } = await (admin.from("regulatory_events") as any)
    .select("event_type, classification, summary, firm_name")
    .eq("id", row.regulatory_event_id)
    .maybeSingle();

  const { error } = await (admin.from("supplier_compliance_history") as any)
    .update({
      match_status:           decision,
      reviewed_by_profile_id: user.id,
      reviewed_at:            new Date().toISOString(),
      review_notes:           body.notes?.trim() || null,
    })
    .eq("id", row.id)
    // Guards against two reviewers deciding the same row at once: the second
    // update matches nothing rather than overwriting the first decision.
    .eq("match_status", "candidate");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      row.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           decision === "confirmed" ? "regulatory_finding_confirmed" : "regulatory_finding_rejected",
    record_type:      "supplier_compliance_history",
    record_id:        row.id,
    previous_value:   { match_status: "candidate" },
    new_value:        {
      match_status: decision,
      supplier_id:  row.supplier_id,
      facility_id:  row.facility_id,
      firm_name:    event?.firm_name ?? null,
      notes:        body.notes?.trim() || null,
    },
  });

  // Only now — once a person has agreed the record is theirs — is it safe to
  // speak about it as the supplier's history.
  if (decision === "confirmed" && event) {
    const severity = findingSeverity(event.event_type, event.classification);
    const label = EVENT_TYPE_LABEL[event.event_type as RegulatoryEventType] ?? "Compliance action";

    await notify(admin, {
      importerId: row.importer_id,
      type:       "regulatory_finding_confirmed",
      title:      `${label} confirmed against a supplier`,
      body:
        `${event.summary} Confirmed by ${profile.full_name ?? profile.email}. ` +
        "Consider whether this changes the supplier's evaluation or triggers a reassessment.",
      targetUrl:  "/compliance-history",
      severity:   severity === "critical" ? "critical" : "warning",
    });
  }

  return NextResponse.json({ ok: true, id: row.id, match_status: decision });
}
