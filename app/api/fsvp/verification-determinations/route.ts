// POST — a qualified individual determines which supplier verification
// activities are appropriate, and why.
//
// § 1.506(d)(1)(i) requires the importer to determine and document which
// verification activities are needed, considering the § 1.505 evaluation of the
// food and the foreign supplier. § 1.506(d)(2) then requires an onsite audit
// before first import and at least annually where the FOREIGN SUPPLIER controls
// a hazard with a reasonable probability of serious adverse health consequences
// or death — unless there is an adequate written determination that other
// activities are appropriate.
//
// This used to be one free-text column, which made the second rule
// unenforceable: nothing could tell an importer who had justified an
// alternative from one who had simply not thought about it. The structure here
// exists so the rule can be checked, and the database enforces it too
// (enforce_sahcodha_audit_rule in migration 010).

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { refusePreviewWrite } from "@/lib/auth/preview-guard";
import { isActiveOn } from "@/lib/fsvp/qualified-individuals";

export const runtime = "edge";

const ACTIVITIES = ["onsite_audit", "sampling_testing", "records_review", "other_appropriate_activity"] as const;

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.importer_id) {
    return NextResponse.json({ error: "Your account is not linked to an importer organization." }, { status: 403 });
  }

  const refusal = refusePreviewWrite(profile.role, "determine verification activities");
  if (refusal) return refusal;

  const importerId: string = profile.importer_id;
  const admin = createAdminSupabaseClient();

  const body = await req.json().catch(() => ({})) as {
    fsvp_record_id?: string;
    activities?: string[];
    frequency_notes?: string;
    hazard_analysis_basis?: string;
    supplier_performance_basis?: string;
    food_and_supplier_risk_basis?: string;
    storage_and_transport_basis?: string;
    sahcodha_hazard_present?: boolean;
    controlled_by_foreign_supplier?: boolean;
    annual_onsite_audit_performed?: boolean;
    alternative_justification?: string;
  };

  const recordId = body.fsvp_record_id?.trim() ?? "";
  if (!recordId) return NextResponse.json({ error: "Choose the FSVP record." }, { status: 400 });

  const activities = (body.activities ?? []).filter((a) => (ACTIVITIES as readonly string[]).includes(a));
  if (activities.length === 0) {
    return NextResponse.json(
      { error: "Choose at least one verification activity. § 1.506(e)(1) lists onsite audit, sampling and testing, and review of records." },
      { status: 400 }
    );
  }

  // Each § 1.506(d)(1)(i) factor is required separately, so a blank one is
  // visible rather than absorbed into a paragraph that mentions none of them.
  const factors: Array<[keyof typeof body, string]> = [
    ["frequency_notes",              "how often the activities will be performed"],
    ["hazard_analysis_basis",        "what the hazard analysis found"],
    ["supplier_performance_basis",   "the supplier's performance history"],
    ["food_and_supplier_risk_basis", "the risk posed by the food and the supplier"],
  ];

  for (const [key, what] of factors) {
    if (!String(body[key] ?? "").trim()) {
      return NextResponse.json(
        { error: `§ 1.506(d)(1)(i) requires you to consider ${what}. Record it.` },
        { status: 400 }
      );
    }
  }

  const sahcodha = body.sahcodha_hazard_present === true;
  const bySupplier = body.controlled_by_foreign_supplier === true;
  const audited = body.annual_onsite_audit_performed === true;
  const justification = body.alternative_justification?.trim() ?? "";

  // Checked here as well as in the database, because the API can say what to do
  // about it and a raised exception cannot.
  if (sahcodha && bySupplier && !audited && !justification) {
    return NextResponse.json(
      {
        error:
          "§ 1.506(d)(2): this supplier controls a hazard with a reasonable probability of serious " +
          "adverse health consequences or death. That requires an onsite audit before first import and " +
          "at least annually, unless you record an adequate written determination that other " +
          "verification activities are appropriate. Record the audit, or the justification.",
      },
      { status: 400 }
    );
  }

  const { data: qi } = await (admin.from("qualified_individuals") as any)
    .select("id, active_from, active_to")
    .eq("profile_id", user.id)
    .eq("importer_id", importerId)
    .maybeSingle();

  if (!qi) {
    return NextResponse.json(
      { error: "Only a registered qualified individual can determine verification activities — § 1.503." },
      { status: 403 }
    );
  }
  if (!isActiveOn(qi)) {
    return NextResponse.json(
      { error: "Your qualification period has ended. An importer administrator must reinstate you first." },
      { status: 403 }
    );
  }

  const { data: record } = await (admin.from("fsvp_records") as any)
    .select("id, importer_id")
    .eq("id", recordId)
    .maybeSingle();

  if (!record || record.importer_id !== importerId) {
    return NextResponse.json({ error: "That FSVP record does not belong to your organization." }, { status: 403 });
  }

  const { data: existing } = await (admin.from("verification_determinations") as any)
    .select("id")
    .eq("fsvp_record_id", recordId)
    .is("superseded_at", null)
    .maybeSingle();

  if (existing) {
    await (admin.from("verification_determinations") as any)
      .update({ superseded_at: new Date().toISOString() })
      .eq("id", existing.id);
  }

  const { data: created, error } = await (admin.from("verification_determinations") as any)
    .insert({
      importer_id:                    importerId,
      fsvp_record_id:                 recordId,
      activities,
      frequency_notes:                body.frequency_notes!.trim(),
      hazard_analysis_basis:          body.hazard_analysis_basis!.trim(),
      supplier_performance_basis:     body.supplier_performance_basis!.trim(),
      food_and_supplier_risk_basis:   body.food_and_supplier_risk_basis!.trim(),
      storage_and_transport_basis:    body.storage_and_transport_basis?.trim() || null,
      sahcodha_hazard_present:        sahcodha,
      controlled_by_foreign_supplier: bySupplier,
      annual_onsite_audit_performed:  audited,
      alternative_justification:      justification || null,
      qualified_individual_id:        qi.id,
      created_by_profile_id:          user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (existing) {
      await (admin.from("verification_determinations") as any)
        .update({ superseded_at: null })
        .eq("id", existing.id);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      importerId,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           existing ? "verification_determination_superseded" : "verification_determination_recorded",
    record_type:      "verification_determinations",
    record_id:        created.id,
    previous_value:   existing ? { id: existing.id } : null,
    new_value:        {
      fsvp_record_id: recordId,
      activities,
      sahcodha_hazard_present: sahcodha,
      controlled_by_foreign_supplier: bySupplier,
      annual_onsite_audit_performed: audited,
      alternative_justified: Boolean(justification),
    },
  });

  return NextResponse.json({ ok: true, id: created.id, superseded: Boolean(existing) });
}
