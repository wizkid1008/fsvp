// POST — a qualified individual determines whether FSVP applies to a food.
//
// The determination is the front door to an FSVP record: § 1.501 exempts whole
// categories outright and §§ 1.511–1.513 reduce what is required, so until
// someone has decided which of the three applies, the platform does not know
// what to ask for. /api/fsvp-records refuses to open a record without one.
//
// Determinations are never edited. Making a new one for a pair supersedes the
// old, which stays with superseded_at stamped — an investigator is entitled to
// see that a food was once determined exempt and no longer is.
//
// The citation is written here from lib/fsvp/applicability.ts, never taken from
// the client, so a determination cannot cite a section that does not say what it
// claims.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/notify";
import { validateBasis, OUTCOME_LABEL } from "@/lib/fsvp/applicability";
import { isActiveOn } from "@/lib/fsvp/qualified-individuals";
import { hashAttestationContent } from "@/lib/fsvp/qi-attestation";

export const runtime = "edge";

const ATTESTATION_STATEMENT =
  "I am a qualified individual as defined in 21 CFR 1.500. I determined how the Foreign Supplier " +
  "Verification Program requirements apply to this food, on the basis and authority stated, and " +
  "the rationale above is accurate and complete to the best of my knowledge.";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.importer_id) {
    return NextResponse.json({ error: "Your account is not linked to an importer organization." }, { status: 403 });
  }

  const importerId: string = profile.importer_id;
  const admin = createAdminSupabaseClient();

  const body = await req.json().catch(() => ({})) as {
    supplier_id?: string;
    product_id?: string;
    outcome?: string;
    basis?: string;
    rationale?: string;
    expires_at?: string;
    entity_size_determination_id?: string;
  };

  const supplierId = body.supplier_id?.trim() ?? "";
  const productId  = body.product_id?.trim() ?? "";
  const rationale  = body.rationale?.trim() ?? "";

  if (!supplierId || !productId) {
    return NextResponse.json({ error: "Choose the exporter and the food." }, { status: 400 });
  }
  if (!rationale) {
    return NextResponse.json(
      { error: "Record why this determination is correct. A citation without reasoning is not a determination." },
      { status: 400 }
    );
  }

  const check = validateBasis(body.outcome, body.basis, {
    entitySizeDeterminationId: body.entity_size_determination_id ?? null,
  });
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  // ── The signer must be an active QI in this tenant ───────────────────────
  const { data: qi } = await (admin.from("qualified_individuals") as any)
    .select("id, active_from, active_to")
    .eq("profile_id", user.id)
    .eq("importer_id", importerId)
    .maybeSingle();

  if (!qi) {
    return NextResponse.json(
      { error: "Only a registered qualified individual can determine how FSVP applies to a food." },
      { status: 403 }
    );
  }
  if (!isActiveOn(qi)) {
    return NextResponse.json(
      { error: "Your qualification period has ended. An importer administrator must reinstate you first." },
      { status: 403 }
    );
  }

  // ── The pair must belong to this importer ────────────────────────────────
  const [{ data: link }, { data: product }] = await Promise.all([
    (admin.from("supplier_relationships") as any)
      .select("id")
      .eq("relationship_type", "importer_supplier")
      .eq("importer_id", importerId)
      .eq("supplier_id", supplierId)
      .in("status", ["active", "pending_invite"])
      .maybeSingle(),
    (admin.from("products_verify") as any)
      .select("id, supplier_id, product_name")
      .eq("id", productId)
      .maybeSingle(),
  ]);

  if (!link) {
    return NextResponse.json({ error: "That exporter is not linked to your organization." }, { status: 403 });
  }
  if (!product || product.supplier_id !== supplierId) {
    return NextResponse.json({ error: "That food does not belong to the selected exporter." }, { status: 400 });
  }

  if (body.entity_size_determination_id) {
    const { data: size } = await (admin.from("entity_size_determinations") as any)
      .select("id")
      .eq("id", body.entity_size_determination_id)
      .eq("importer_id", importerId)
      .maybeSingle();
    if (!size) {
      return NextResponse.json({ error: "That entity size determination does not belong to your organization." }, { status: 400 });
    }
  }

  // ── Supersede whatever is live for this pair ─────────────────────────────
  const { data: existing } = await (admin.from("fsvp_applicability_determinations") as any)
    .select("id, outcome, basis")
    .eq("importer_id", importerId)
    .eq("supplier_id", supplierId)
    .eq("product_id", productId)
    .is("superseded_at", null)
    .maybeSingle();

  if (existing) {
    await (admin.from("fsvp_applicability_determinations") as any)
      .update({ superseded_at: new Date().toISOString() })
      .eq("id", existing.id);
  }

  const { data: created, error } = await (admin.from("fsvp_applicability_determinations") as any)
    .insert({
      importer_id:                  importerId,
      supplier_id:                  supplierId,
      product_id:                   productId,
      outcome:                      check.spec.outcome,
      basis:                        check.spec.basis,
      citation:                     check.spec.citation,
      rationale,
      entity_size_determination_id: body.entity_size_determination_id || null,
      qualified_individual_id:      qi.id,
      expires_at:                   body.expires_at || null,
      created_by_profile_id:        user.id,
    })
    .select("id")
    .single();

  if (error) {
    // Put the superseded row back rather than leaving the pair undetermined.
    if (existing) {
      await (admin.from("fsvp_applicability_determinations") as any)
        .update({ superseded_at: null })
        .eq("id", existing.id);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Sign it, in the same ledger as every other QI signature ──────────────
  const snapshot =
    `${OUTCOME_LABEL[check.spec.outcome]} — ${check.spec.label} (${check.spec.citation})\n\n${rationale}`;

  const { error: signError } = await (admin.from("qi_attestations") as any).insert({
    importer_id:                    importerId,
    qualified_individual_id:        qi.id,
    applicability_determination_id: created.id,
    attestation_type:               "applicability_determination",
    statement:                      ATTESTATION_STATEMENT,
    content_snapshot:               snapshot,
    content_hash:                   await hashAttestationContent(snapshot),
    signed_by_profile_id:           user.id,
  });

  if (signError) {
    // A determination without its signature is not a determination.
    await (admin.from("fsvp_applicability_determinations") as any).delete().eq("id", created.id);
    if (existing) {
      await (admin.from("fsvp_applicability_determinations") as any)
        .update({ superseded_at: null })
        .eq("id", existing.id);
    }
    return NextResponse.json({ error: signError.message }, { status: 500 });
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      importerId,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           existing ? "applicability_superseded" : "applicability_determined",
    record_type:      "fsvp_applicability_determinations",
    record_id:        created.id,
    previous_value:   existing ? { outcome: existing.outcome, basis: existing.basis } : null,
    new_value:        {
      supplier_id: supplierId,
      product_id: productId,
      outcome: check.spec.outcome,
      basis: check.spec.basis,
      citation: check.spec.citation,
      expires_at: body.expires_at ?? null,
    },
  });

  await notify(admin, {
    importerId,
    supplierId,
    type:      "applicability_determined",
    title:     `${OUTCOME_LABEL[check.spec.outcome]}: ${product.product_name}`,
    body:      `${check.spec.label} — ${check.spec.citation}. Determined by ${profile.full_name ?? profile.email}.`,
    targetUrl: "/applicability",
    severity:  check.spec.outcome === "exempt" ? "warning" : "info",
  });

  return NextResponse.json({
    ok: true,
    id: created.id,
    outcome: check.spec.outcome,
    citation: check.spec.citation,
    superseded: Boolean(existing),
  });
}
