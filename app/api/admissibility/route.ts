// POST — determine whether a commodity from this origin may enter.
//
// Resolves the product against the reference layer (migration 012) and records
// the answer as a dated snapshot (migration 013). The rule is COPIED onto the
// determination rather than joined at read time, so a rule superseded next year
// cannot silently rewrite what an importer was told this year.
//
// Unlike the FSVP determinations, this is NOT qualified-individual work.
// § 1.503 covers hazard analysis, supplier evaluation and verification
// activities; commodity admissibility is an APHIS/FDA entry question the
// importer answers. Requiring a QI signature here would misrepresent what the
// regulation asks of them.
//
// The interesting paths are the refusals. See lib/admissibility/resolve.ts:
// an overdue rule, an unevaluable region rule, or two equally specific rules
// that disagree all produce a 409 naming what a person has to go and check —
// never a determination.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { refusePreviewWrite } from "@/lib/auth/preview-guard";
import { conditionsOf, resolveRule, type RuleRow } from "@/lib/admissibility/resolve";

export const runtime = "edge";

const USES = ["consumption", "processing", "propagation", "research"] as const;
const STATES = ["fresh", "frozen", "dried", "cooked", "canned", "other"] as const;

/** A determination is valid for a year, then capped to the rule's review date. */
const VALIDITY_DAYS = 365;

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

  const refusal = refusePreviewWrite(profile.role, "determine admissibility");
  if (refusal) return refusal;

  const importerId: string = profile.importer_id;
  const admin = createAdminSupabaseClient();

  const body = await req.json().catch(() => ({})) as {
    product_id?: string;
    intended_use?: string;
    processing_state?: string;
    rationale?: string;
  };

  const productId = body.product_id?.trim() ?? "";
  if (!productId) return NextResponse.json({ error: "Choose the product." }, { status: 400 });

  const intendedUse = (USES as readonly string[]).includes(body.intended_use ?? "")
    ? (body.intended_use as (typeof USES)[number]) : null;
  const processingState = (STATES as readonly string[]).includes(body.processing_state ?? "")
    ? (body.processing_state as (typeof STATES)[number]) : null;

  if (!intendedUse)    return NextResponse.json({ error: "State the intended use." }, { status: 400 });
  if (!processingState) return NextResponse.json({ error: "State the processing state." }, { status: 400 });

  // ── The product must be classified and have an origin ────────────────────
  const { data: product } = await (admin.from("products_verify") as any)
    .select("id, importer_id, supplier_id, product_name, commodity_id, country_of_origin")
    .eq("id", productId)
    .maybeSingle();

  if (!product) return NextResponse.json({ error: "That product does not exist." }, { status: 404 });

  // Tenancy is resolved through the supplier relationship, NOT through
  // products_verify.importer_id.
  //
  // That column is nullable — a supplier-created product carries no importer —
  // so `product.importer_id && product.importer_id !== importerId` skips the
  // check entirely whenever it is null, letting any signed-in importer write a
  // determination against another tenant's product. The relationship is the
  // authoritative link (see the applicability route, which does the same), and
  // it cannot be null by construction.
  const { data: link } = await (admin.from("supplier_relationships") as any)
    .select("id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", importerId)
    .eq("supplier_id", product.supplier_id)
    .in("status", ["active", "pending_invite"])
    .maybeSingle();

  if (!link) {
    return NextResponse.json(
      { error: "That product belongs to a supplier your organization is not linked to." },
      { status: 403 }
    );
  }

  if (!product.commodity_id) {
    return NextResponse.json(
      {
        error:
          "This product has not been classified against the commodity taxonomy. Admissibility is a " +
          "question about a commodity from an origin, so it cannot be answered until the product is " +
          "linked to one.",
      },
      { status: 400 }
    );
  }
  if (!product.country_of_origin) {
    return NextResponse.json(
      { error: "This product has no country of origin recorded. Admissibility depends on where it comes from." },
      { status: 400 }
    );
  }

  // ── Resolve against the reference layer ──────────────────────────────────
  // Every rule for the commodity is loaded, not just the ones that look
  // relevant: resolve() has to SEE the region rules and the overdue ones in
  // order to refuse on account of them. Filtering them out in SQL would hide
  // exactly the cases it exists to catch.
  const { data: rules, error: rulesError } = await (admin.from("country_commodity_rules") as any)
    .select(
      "id, commodity_id, origin_country, origin_region, intended_use, processing_state, " +
      "admissibility, permit_required, phyto_required, treatment_required, peq_required, " +
      "additional_declarations, designated_ports, conditions_text, citation, source_url, " +
      "reviewed_at, review_due_at, effective_from, effective_to, superseded_at, " +
      "verification_status, source_changed_at"
    )
    .eq("commodity_id", product.commodity_id);

  if (rulesError) {
    return NextResponse.json(
      { error: `The reference layer could not be read, so admissibility cannot be determined. ${rulesError.message}` },
      { status: 503 }
    );
  }

  const resolution = resolveRule((rules ?? []) as RuleRow[], {
    commodityId:     product.commodity_id,
    originCountry:   product.country_of_origin,
    intendedUse,
    processingState,
  });

  if (resolution.status !== "resolved") {
    return NextResponse.json(
      {
        // "No rule on file" is the honest answer and the common one — the
        // reference layer is curated by hand and ships empty, deliberately
        // (docs/reference-layer-curation.md). But said in four words it reads
        // like a fault in the platform rather than a gap in the data, and
        // leaves the importer with nowhere to go. Say which gap it is and who
        // closes it. The absence still blocks: a determination invented to get
        // past this screen is exactly the confident wrong answer the curated
        // table exists to prevent.
        error: resolution.status === "no_rule"
          ? "Reference rule needed before an admissibility determination can be recorded. " +
            "A platform administrator should add the country-commodity rule after checking " +
            "APHIS ACIR; until then this product can continue through file-building, but it " +
            "is not ready for final admissibility approval."
          : "The rules on file cannot support a determination.",
        status: resolution.status,
        reasons: resolution.reasons,
        // Named so a maintainer can go straight to the rows needing attention.
        candidates: resolution.status === "manual_review"
          ? resolution.candidates.map((r) => ({
              id: r.id, citation: r.citation, admissibility: r.admissibility,
              review_due_at: r.review_due_at, origin_region: r.origin_region,
            }))
          : [],
      },
      { status: 409 }
    );
  }

  const rule = resolution.rule;

  // ── Supersede whatever is live for this question ─────────────────────────
  const { data: existing } = await (admin.from("admissibility_determinations") as any)
    .select("id")
    .eq("product_id", productId)
    .eq("intended_use", intendedUse)
    .eq("processing_state", processingState)
    .is("superseded_at", null)
    .maybeSingle();

  if (existing) {
    await (admin.from("admissibility_determinations") as any)
      .update({ superseded_at: new Date().toISOString() })
      .eq("id", existing.id);
  }

  // The trigger caps this to the rule's review date — a determination cannot
  // outlive the warrant it rests on.
  const expiresAt = new Date(Date.now() + VALIDITY_DAYS * 86_400_000).toISOString().slice(0, 10);

  const { data: created, error } = await (admin.from("admissibility_determinations") as any)
    .insert({
      importer_id:      importerId,
      product_id:       productId,
      commodity_id:     product.commodity_id,
      origin_country:   product.country_of_origin,
      intended_use:     intendedUse,
      processing_state: processingState,
      outcome:          rule.admissibility,
      citation:         rule.citation,
      source_url:       rule.source_url,
      conditions:       conditionsOf(rule),
      rule_id:          rule.id,
      rule_snapshot:    rule,
      rationale:        body.rationale?.trim() || null,
      expires_at:       expiresAt,
      determined_by_profile_id: user.id,
    })
    .select("id, outcome, expires_at, conditions")
    .single();

  if (error) {
    if (existing) {
      await (admin.from("admissibility_determinations") as any)
        .update({ superseded_at: null })
        .eq("id", existing.id);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      importerId,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           existing ? "admissibility_superseded" : "admissibility_determined",
    record_type:      "admissibility_determinations",
    record_id:        created.id,
    previous_value:   existing ? { id: existing.id } : null,
    new_value:        {
      product_id: productId,
      origin_country: product.country_of_origin,
      intended_use: intendedUse,
      processing_state: processingState,
      outcome: rule.admissibility,
      citation: rule.citation,
      rule_id: rule.id,
    },
  });

  return NextResponse.json({
    ok: true,
    id: created.id,
    outcome: created.outcome,
    citation: rule.citation,
    conditions: created.conditions,
    expires_at: created.expires_at,
    superseded: Boolean(existing),
  });
}
