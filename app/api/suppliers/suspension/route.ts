// POST   — suspend a supplier, with a basis and a reason.
// PATCH  — lift a suspension, with a rationale.
//
// Suspension is per importer, not per supplier. `suppliers` is a global entity
// shared between importers, so writing suspension onto the supplier row would
// let one importer's decision suspend a firm for everyone else buying from
// them. See the header of 010_suspension_assurances_verification.sql.
//
// Both directions are recorded and neither is silent. A suspension that can be
// cleared without a reason is not a control, and the history of "suspended for
// four months in 2025, then reinstated" is exactly what an FDA investigator
// asks about.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { deniesTenant } from "@/lib/auth/tenancy";
import { refusePreviewWrite } from "@/lib/auth/preview-guard";
import { isSuspensionBasis } from "@/lib/fsvp/gates";
import { notify } from "@/lib/notifications/notify";

export const runtime = "edge";

async function caller(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "You must be signed in." }, { status: 401 }) };

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.importer_id) {
    return { error: NextResponse.json({ error: "Your account is not linked to an importer organization." }, { status: 403 }) };
  }

  return { user, profile, importerId: profile.importer_id as string };
}

export async function POST(req: NextRequest) {
  const ctx = await caller(req);
  if ("error" in ctx) return ctx.error;
  const { user, profile, importerId } = ctx;

  const refusal = refusePreviewWrite(profile.role, "suspend suppliers");
  if (refusal) return refusal;

  const body = await req.json().catch(() => ({})) as {
    supplier_id?: string;
    basis?: string;
    reason?: string;
  };

  const supplierId = body.supplier_id?.trim() ?? "";
  const reason = body.reason?.trim() ?? "";

  if (!supplierId) return NextResponse.json({ error: "Choose the supplier to suspend." }, { status: 400 });
  if (!isSuspensionBasis(body.basis)) {
    return NextResponse.json({ error: "Choose a basis for the suspension." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json(
      { error: "Record why this supplier is being suspended. A suspension without a reason cannot be remedied or reviewed." },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();

  const { data: link } = await (admin.from("supplier_relationships") as any)
    .select("id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", importerId)
    .eq("supplier_id", supplierId)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: "That supplier is not linked to your organization." }, { status: 403 });
  }

  const { data: existing } = await (admin.from("supplier_suspensions") as any)
    .select("id")
    .eq("importer_id", importerId)
    .eq("supplier_id", supplierId)
    .is("lifted_at", null)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "This supplier is already suspended." }, { status: 409 });
  }

  const { data: created, error } = await (admin.from("supplier_suspensions") as any)
    .insert({
      importer_id:             importerId,
      supplier_id:             supplierId,
      basis:                   body.basis,
      reason,
      suspended_by_profile_id: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A suspension is new information about the supplier's performance, which is
  // § 1.508(b) on its face. Every open record for this supplier is flagged for
  // reassessment; the database trigger moves the record status.
  const { data: records } = await (admin.from("fsvp_records") as any)
    .select("id")
    .eq("importer_id", importerId)
    .eq("supplier_id", supplierId);

  const recordIds = ((records ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (recordIds.length > 0) {
    await (admin.from("reassessment_triggers") as any).insert(
      recordIds.map((recordId) => ({
        importer_id:    importerId,
        fsvp_record_id: recordId,
        trigger_type:   "supplier_suspended",
        source_table:   "supplier_suspensions",
        source_id:      created.id,
        detail:         `Supplier suspended: ${reason}`,
      }))
    );
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      importerId,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "supplier_suspended",
    record_type:      "supplier_suspensions",
    record_id:        created.id,
    new_value:        { supplier_id: supplierId, basis: body.basis, reason, records_flagged: recordIds.length },
  });

  await notify(admin, {
    importerId,
    supplierId,
    type:      "supplier_suspended",
    title:     "Supplier suspended",
    body:      `${reason} No FSVP record for this supplier can be approved until the suspension is lifted.`,
    targetUrl: "/suppliers",
    severity:  "critical",
  });

  return NextResponse.json({ ok: true, id: created.id, records_flagged: recordIds.length });
}

export async function PATCH(req: NextRequest) {
  const ctx = await caller(req);
  if ("error" in ctx) return ctx.error;
  const { user, profile, importerId } = ctx;

  const refusal = refusePreviewWrite(profile.role, "lift suspensions");
  if (refusal) return refusal;

  const body = await req.json().catch(() => ({})) as {
    suspension_id?: string;
    lift_rationale?: string;
  };

  const rationale = body.lift_rationale?.trim() ?? "";
  if (!body.suspension_id) {
    return NextResponse.json({ error: "Which suspension is being lifted?" }, { status: 400 });
  }
  if (!rationale) {
    return NextResponse.json(
      { error: "Record what changed. Lifting a suspension is a decision in its own right and needs its own reasoning." },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();

  const { data: row } = await (admin.from("supplier_suspensions") as any)
    .select("id, importer_id, supplier_id, lifted_at")
    .eq("id", body.suspension_id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "That suspension no longer exists." }, { status: 404 });
  if (deniesTenant(profile, row.importer_id)) {
    return NextResponse.json({ error: "That suspension belongs to another organization." }, { status: 403 });
  }
  if (row.lifted_at) {
    return NextResponse.json({ error: "That suspension has already been lifted." }, { status: 409 });
  }

  const { error } = await (admin.from("supplier_suspensions") as any)
    .update({
      lifted_at:            new Date().toISOString(),
      lifted_by_profile_id: user.id,
      lift_rationale:       rationale,
    })
    .eq("id", row.id)
    // Guards two reviewers lifting at once: the second update matches nothing.
    .is("lifted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      row.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "supplier_suspension_lifted",
    record_type:      "supplier_suspensions",
    record_id:        row.id,
    previous_value:   { lifted_at: null },
    new_value:        { supplier_id: row.supplier_id, lift_rationale: rationale },
  });

  await notify(admin, {
    importerId:  row.importer_id,
    supplierId:  row.supplier_id,
    type:        "supplier_suspension_lifted",
    title:       "Supplier suspension lifted",
    body:        rationale,
    targetUrl:   "/suppliers",
    severity:    "info",
  });

  return NextResponse.json({ ok: true, id: row.id });
}
