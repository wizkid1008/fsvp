// POST — enter a country-commodity rule, and POST /commodity — enter a
// commodity for it to be about.
//
// Until now the reference layer could only grow by writing a migration, which
// meant the maintenance screen could verify rules nobody was able to create.
//
// Everything here enters as a DRAFT, and that is not a client-supplied field:
// `verification_status` is written server-side exactly like the citation on an
// applicability determination. A rule becomes usable when a second person
// confirms it against the source (/api/reference-rules/verify), never at the
// moment somebody types it.
//
// The validation is deliberately strict about provenance rather than about
// shape. A rule missing a citation or a source URL is refused outright — the
// database enforces that too, but a 400 explaining why is more use than a
// raised constraint.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

const USES = [
  "any", "consumption", "processing", "propagation", "research", "not_for_propagation",
] as const;
const STATES = [
  "any", "fresh", "fresh_cut", "frozen", "dried", "cooked", "canned", "other",
] as const;
const OUTCOMES = ["permitted", "restricted", "prohibited"] as const;

/**
 * True, false, or null for "the source does not say" — migration 026.
 *
 * The old reading was `body.x === true`, which quietly turned an omitted field
 * into a checked negative. That is the same error the schema made, and it made
 * it in the layer where a curator would least expect it: leaving a checkbox
 * alone because the document was silent produced a rule asserting the
 * requirement does not apply.
 */
function tristate(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

/**
 * Newly entered rules get a short review window rather than the schema default.
 * Nothing about a freshly transcribed rule has been confirmed yet, and a year
 * is a long time to carry an unchecked claim.
 */
const INITIAL_REVIEW_DAYS = 120;

async function requireAdmin(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "You must be signed in." }, { status: 401 }) };
  }

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "administrator") {
    return {
      error: NextResponse.json(
        { error: "Only a platform administrator can maintain the reference layer." },
        { status: 403 }
      ),
    };
  }

  return { user, profile };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { user, profile } = auth;

  const admin = createAdminSupabaseClient();

  const body = await req.json().catch(() => ({})) as {
    commodity_id?: string;
    origin_country?: string;
    origin_region?: string;
    intended_use?: string;
    processing_state?: string;
    admissibility?: string;
    origin_scope?: string;
    /** Tri-state. Omitted or null means the source document does not say. */
    permit_required?: boolean | null;
    phyto_required?: boolean | null;
    treatment_required?: boolean | null;
    peq_required?: boolean | null;
    additional_declarations?: string[];
    designated_ports?: string[];
    conditions_text?: string;
    citation?: string;
    source_url?: string;
    cfr_part?: string;
  };

  const commodityId = body.commodity_id?.trim() ?? "";
  const citation = body.citation?.trim() ?? "";
  const sourceUrl = body.source_url?.trim() ?? "";
  const country = body.origin_country?.trim() || null;
  const region = body.origin_region?.trim() || null;

  if (!commodityId) {
    return NextResponse.json({ error: "Choose the commodity this rule is about." }, { status: 400 });
  }

  // Scope is declared, never inferred — migration 026. A rule with no origin
  // used to be refused outright, which is why "Dried Cocoa Leaves from All
  // Countries" could not be entered at all. It can now, but only by saying
  // `global` out loud: an omitted origin must not quietly become a rule about
  // everywhere, because the rule most likely to be written that way is a
  // prohibition.
  const scope = body.origin_scope?.trim() || (country ? "country" : region ? "region" : null);

  if (country && region) {
    return NextResponse.json(
      { error: "Give either a country or a region, not both — a rule scoped to both cannot be resolved." },
      { status: 400 }
    );
  }

  if (!scope) {
    return NextResponse.json(
      {
        error:
          "Give a country, a region, or state that this rule is global. A rule with no origin and " +
          "no declared scope applies to nothing.",
      },
      { status: 400 }
    );
  }

  if (!["country", "region", "global"].includes(scope)) {
    return NextResponse.json({ error: "Scope must be country, region or global." }, { status: 400 });
  }

  if (scope === "country" && !country) {
    return NextResponse.json({ error: "A country-scoped rule needs a country." }, { status: 400 });
  }
  if (scope === "region" && !region) {
    return NextResponse.json({ error: "A region-scoped rule needs a region." }, { status: 400 });
  }
  if (scope === "global" && (country || region)) {
    return NextResponse.json(
      { error: "A global rule covers every origin, so it must not also name one." },
      { status: 400 }
    );
  }

  if (citation.length < 3) {
    return NextResponse.json(
      {
        error:
          "Cite the authority. A rule that cannot say where it came from is an assertion, and this " +
          "table exists so that assertions cannot pass for rules.",
      },
      { status: 400 }
    );
  }

  if (!/^https?:\/\//i.test(sourceUrl)) {
    return NextResponse.json(
      { error: "Give the source URL, so the next person to review this can go straight to it." },
      { status: 400 }
    );
  }

  if (!(OUTCOMES as readonly string[]).includes(body.admissibility ?? "")) {
    return NextResponse.json(
      { error: "State whether the movement is permitted, restricted or prohibited." },
      { status: 400 }
    );
  }

  const intendedUse = (USES as readonly string[]).includes(body.intended_use ?? "")
    ? body.intended_use! : "any";
  const processingState = (STATES as readonly string[]).includes(body.processing_state ?? "")
    ? body.processing_state! : "any";

  // Region-scoped rules cannot be resolved automatically — there is no
  // country-to-region mapping — so they force manual review wherever they
  // apply. Accepted, because recording one is better than losing it, but the
  // caller is told what it will and will not do.
  const regionWarning = region
    ? "Recorded. Note that region-scoped rules cannot be matched to a country automatically, so " +
      "every movement of this commodity will be sent to manual review until a country-scoped rule " +
      "covers it."
    : scope === "global"
    ? "Recorded as a global draft. It will govern every origin for this commodity that no " +
      "country-scoped rule covers, so check that is what the source document says before anyone " +
      "verifies it."
    : null;

  const { data: commodity } = await (admin.from("commodities") as any)
    .select("id, common_name")
    .eq("id", commodityId)
    .maybeSingle();

  if (!commodity) {
    return NextResponse.json({ error: "That commodity does not exist." }, { status: 404 });
  }

  const reviewDue = new Date(Date.now() + INITIAL_REVIEW_DAYS * 86_400_000)
    .toISOString().slice(0, 10);

  const { data: created, error } = await (admin.from("country_commodity_rules") as any)
    .insert({
      commodity_id:            commodityId,
      origin_scope:            scope,
      origin_country:          country,
      origin_region:           region,
      intended_use:            intendedUse,
      processing_state:        processingState,
      admissibility:           body.admissibility,
      permit_required:         tristate(body.permit_required),
      phyto_required:          tristate(body.phyto_required),
      treatment_required:      tristate(body.treatment_required),
      peq_required:            tristate(body.peq_required),
      additional_declarations: (body.additional_declarations ?? []).filter((d) => d?.trim()),
      designated_ports:        (body.designated_ports ?? []).filter((p) => p?.trim()),
      conditions_text:         body.conditions_text?.trim() || null,
      citation,
      source_url:              sourceUrl,
      cfr_part:                body.cfr_part?.trim() || null,
      // Never taken from the client. A rule is usable when somebody else
      // confirms it, not when its author says so.
      verification_status:     "draft",
      review_due_at:           reviewDue,
      created_by_profile_id:   user.id,
    })
    .select("id")
    .single();

  if (error) {
    // The live-scope unique index is the likely cause and deserves a better
    // sentence than the raw constraint name.
    if (error.code === "23505") {
      return NextResponse.json(
        {
          error:
            "A live rule already covers this exact commodity, origin, use and processing state. " +
            "Supersede that one rather than adding a second — two rules of equal specificity that " +
            "disagree stop any determination being made at all.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      null,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "reference_rule_created",
    record_type:      "country_commodity_rules",
    record_id:        created.id,
    new_value:        {
      commodity: commodity.common_name,
      origin: country ?? region ?? "all origins",
      origin_scope: scope,
      intended_use: intendedUse,
      processing_state: processingState,
      admissibility: body.admissibility,
      citation,
      verification_status: "draft",
    },
  });

  return NextResponse.json({
    ok: true,
    id: created.id,
    verification_status: "draft",
    review_due_at: reviewDue,
    note:
      regionWarning ??
      "Recorded as a draft. It cannot support a determination until someone other than you " +
      "confirms it against the source.",
  });
}
