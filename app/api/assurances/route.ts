// POST — record a § 1.507 written assurance.
//
// § 1.507 covers the case where a hazard requiring a control is not controlled
// before the food reaches the United States. The importer may rely on a
// customer or an entity further down the chain — but only against a written
// assurance, renewed at least annually, carrying an effective date and the
// signature of an authorised official (§ 1.507(b)).
//
// The citation is written here from lib/fsvp/assurances.ts, never taken from
// the client, so an assurance cannot cite a paragraph that does not say what it
// claims. Recording a new assurance for the same record and category supersedes
// the old one, which stays — an investigator is entitled to see the assurance
// that was in force last year.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { refusePreviewWrite } from "@/lib/auth/preview-guard";
import { validateAssurance, defaultExpiry } from "@/lib/fsvp/assurances";

export const runtime = "edge";

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

  const refusal = refusePreviewWrite(profile.role, "record written assurances");
  if (refusal) return refusal;

  const importerId: string = profile.importer_id;
  const admin = createAdminSupabaseClient();

  const body = await req.json().catch(() => ({})) as {
    fsvp_record_id?: string;
    category?: string;
    counterparty_name?: string;
    counterparty_role?: string;
    signatory_name?: string;
    signatory_title?: string;
    food_scope?: string;
    hazard_description?: string;
    assurance_text?: string;
    effective_from?: string;
    expires_at?: string;
    document_id?: string;
  };

  const recordId = body.fsvp_record_id?.trim() ?? "";
  const foodScope = body.food_scope?.trim() ?? "";
  const assuranceText = body.assurance_text?.trim() ?? "";

  if (!recordId) return NextResponse.json({ error: "Choose the FSVP record this assurance covers." }, { status: 400 });
  if (!foodScope) return NextResponse.json({ error: "State which food the assurance covers." }, { status: 400 });
  if (!assuranceText) {
    return NextResponse.json(
      { error: "Record what the assurance actually says. § 1.507 requires the assurance itself, not a note that one exists." },
      { status: 400 }
    );
  }

  const check = validateAssurance(body.category, {
    counterpartyName: body.counterparty_name,
    signatoryName:    body.signatory_name,
  });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const { data: record } = await (admin.from("fsvp_records") as any)
    .select("id, importer_id, supplier_id, product_id")
    .eq("id", recordId)
    .maybeSingle();

  if (!record || record.importer_id !== importerId) {
    return NextResponse.json({ error: "That FSVP record does not belong to your organization." }, { status: 403 });
  }

  const relies = check.spec.needsCounterparty;

  const { data: existing } = await (admin.from("written_assurances") as any)
    .select("id")
    .eq("fsvp_record_id", recordId)
    .eq("category", check.spec.category)
    .is("superseded_at", null)
    .maybeSingle();

  if (existing) {
    await (admin.from("written_assurances") as any)
      .update({ superseded_at: new Date().toISOString() })
      .eq("id", existing.id);
  }

  const { data: created, error } = await (admin.from("written_assurances") as any)
    .insert({
      importer_id:        importerId,
      supplier_id:        record.supplier_id,
      product_id:         record.product_id,
      fsvp_record_id:     recordId,
      category:           check.spec.category,
      citation:           check.spec.citation,
      counterparty_name:  relies ? body.counterparty_name?.trim() : null,
      counterparty_role:  relies ? body.counterparty_role?.trim() || null : null,
      signatory_name:     relies ? body.signatory_name?.trim() : null,
      signatory_title:    relies ? body.signatory_title?.trim() || null : null,
      food_scope:         foodScope,
      hazard_description: body.hazard_description?.trim() || null,
      assurance_text:     assuranceText,
      effective_from:     body.effective_from || undefined,
      // § 1.507(b) makes annual renewal the floor, so an assurance with no end
      // date would quietly become permanent.
      expires_at:         body.expires_at || defaultExpiry(),
      document_id:        body.document_id || null,
      created_by_profile_id: user.id,
    })
    .select("id, expires_at")
    .single();

  if (error) {
    if (existing) {
      await (admin.from("written_assurances") as any)
        .update({ superseded_at: null })
        .eq("id", existing.id);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      importerId,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           existing ? "assurance_renewed" : "assurance_recorded",
    record_type:      "written_assurances",
    record_id:        created.id,
    previous_value:   existing ? { id: existing.id } : null,
    new_value:        {
      fsvp_record_id: recordId,
      category:       check.spec.category,
      citation:       check.spec.citation,
      counterparty:   relies ? body.counterparty_name?.trim() : null,
      expires_at:     created.expires_at,
    },
  });

  return NextResponse.json({
    ok: true,
    id: created.id,
    citation: check.spec.citation,
    expires_at: created.expires_at,
    superseded: Boolean(existing),
  });
}
