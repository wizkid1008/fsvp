/**
 * Whether FSVP applies to a food, and on what authority.
 *
 * The platform used to assume every supplier/product pair needed a full FSVP
 * record. 21 CFR 1.501 exempts whole categories outright, and §§ 1.511–1.513
 * grant reduced ("modified") requirements to very small importers, small
 * foreign suppliers, dietary supplements, and food from countries with a
 * recognized or equivalent food safety system.
 *
 * The basis is enumerated rather than free text for two reasons: the § 1.503
 * gate has to reason about it (see requiredTypesFor in ./qi-attestation), and
 * the citation printed in an FDA records request has to be the right one. The
 * mapping below is applied server-side so a determination cannot be saved
 * citing a section that does not say what it claims.
 */

export type ApplicabilityOutcome = "in_scope" | "exempt" | "modified";

export type ApplicabilityBasis =
  // in scope
  | "standard"
  // exempt — § 1.501
  | "juice_haccp"
  | "seafood_haccp"
  | "research_evaluation"
  | "personal_consumption"
  | "alcoholic_beverage"
  | "processing_and_export"
  | "us_origin_returned"
  | "transshipment"
  | "usda_regulated"
  // modified — §§ 1.511–1.513
  | "very_small_importer"
  | "small_foreign_supplier"
  | "recognized_country_system"
  | "dietary_supplement";

export type BasisSpec = {
  basis: ApplicabilityBasis;
  outcome: ApplicabilityOutcome;
  label: string;
  citation: string;
  /** What the importer is asserting, in plain words, for the UI and the package. */
  description: string;
  /** True when the claim needs an entity_size_determinations row behind it. */
  requiresEntitySize?: boolean;
};

export const APPLICABILITY_BASES: BasisSpec[] = [
  {
    basis: "standard",
    outcome: "in_scope",
    label: "Subject to FSVP",
    citation: "21 CFR 1.502",
    description:
      "This food is subject to the full Foreign Supplier Verification Program requirements.",
  },

  // ── Exemptions, § 1.501 ──────────────────────────────────────────────────
  {
    basis: "juice_haccp",
    outcome: "exempt",
    label: "Juice under HACCP",
    citation: "21 CFR 1.501(b)",
    description:
      "Juice subject to and in compliance with the juice HACCP regulation at 21 CFR part 120.",
  },
  {
    basis: "seafood_haccp",
    outcome: "exempt",
    label: "Fish and fishery products under HACCP",
    citation: "21 CFR 1.501(b)",
    description:
      "Fish or fishery products subject to and in compliance with the seafood HACCP regulation at 21 CFR part 123.",
  },
  {
    basis: "research_evaluation",
    outcome: "exempt",
    label: "Research or evaluation use",
    citation: "21 CFR 1.501(c)",
    description:
      "Food imported for research or evaluation, not intended for retail sale, and labelled accordingly.",
  },
  {
    basis: "personal_consumption",
    outcome: "exempt",
    label: "Personal consumption",
    citation: "21 CFR 1.501(d)",
    description: "Food imported for personal consumption.",
  },
  {
    basis: "alcoholic_beverage",
    outcome: "exempt",
    label: "Alcoholic beverage",
    citation: "21 CFR 1.501(e)",
    description:
      "An alcoholic beverage, or certain food imported by a facility that manufactures alcoholic beverages.",
  },
  {
    basis: "processing_and_export",
    outcome: "exempt",
    label: "Imported for processing and export",
    citation: "21 CFR 1.501(f)",
    description:
      "Food imported for processing and future export, which will not be sold or distributed in the United States.",
  },
  {
    basis: "us_origin_returned",
    outcome: "exempt",
    label: "U.S.-origin food returned",
    citation: "21 CFR 1.501(g)",
    description:
      "Food produced in the United States, exported, and returned without further manufacturing or processing abroad.",
  },
  {
    basis: "transshipment",
    outcome: "exempt",
    label: "Transshipment",
    citation: "21 CFR 1.501(h)",
    description:
      "Food transshipped through the United States to another country, not intended for U.S. distribution.",
  },
  {
    basis: "usda_regulated",
    outcome: "exempt",
    label: "Meat, poultry or egg products under USDA",
    citation: "21 CFR 1.501(i)",
    description:
      "Meat, poultry or egg products subject at the time of importation to the exclusive jurisdiction of USDA.",
  },

  // ── Modified requirements, §§ 1.511–1.513 ────────────────────────────────
  {
    basis: "very_small_importer",
    outcome: "modified",
    label: "Very small importer",
    citation: "21 CFR 1.512",
    description:
      "The importer meets the § 1.500 definition of a very small importer, so modified requirements apply in place of a hazard analysis and supplier evaluation.",
    requiresEntitySize: true,
  },
  {
    basis: "small_foreign_supplier",
    outcome: "modified",
    label: "Small foreign supplier",
    citation: "21 CFR 1.512",
    description:
      "The foreign supplier is a qualified facility, a farm not covered by the produce safety rule, or a small shell egg producer, so modified requirements apply.",
  },
  {
    basis: "recognized_country_system",
    outcome: "modified",
    label: "Recognized or equivalent country system",
    citation: "21 CFR 1.513",
    description:
      "The food is from a country whose food safety system FDA has officially recognized or determined equivalent, and the supplier is in good standing with it.",
  },
  {
    basis: "dietary_supplement",
    outcome: "modified",
    label: "Dietary supplement",
    citation: "21 CFR 1.511",
    description:
      "The food is a dietary supplement or dietary supplement component subject to the modified requirements for supplements.",
  },
];

const BY_BASIS = new Map(APPLICABILITY_BASES.map((b) => [b.basis, b]));

export const OUTCOME_LABEL: Record<ApplicabilityOutcome, string> = {
  in_scope: "Subject to FSVP",
  exempt:   "Exempt",
  modified: "Modified requirements",
};

export function isApplicabilityOutcome(v: unknown): v is ApplicabilityOutcome {
  return v === "in_scope" || v === "exempt" || v === "modified";
}

export function basisSpec(basis: string): BasisSpec | null {
  return BY_BASIS.get(basis as ApplicabilityBasis) ?? null;
}

export function basesForOutcome(outcome: ApplicabilityOutcome): BasisSpec[] {
  return APPLICABILITY_BASES.filter((b) => b.outcome === outcome);
}

export type BasisValidation =
  | { ok: true; spec: BasisSpec }
  | { ok: false; error: string };

/**
 * Checks a basis is real and legal for the stated outcome, and that a claim
 * needing substantiation has it. Called by the API before insert — the citation
 * comes from here, never from the client.
 */
export function validateBasis(
  outcome: unknown,
  basis: unknown,
  opts: { entitySizeDeterminationId?: string | null } = {}
): BasisValidation {
  if (!isApplicabilityOutcome(outcome)) {
    return { ok: false, error: "Outcome must be in_scope, exempt or modified." };
  }

  const spec = basisSpec(String(basis));
  if (!spec) {
    return { ok: false, error: `Unknown basis ${JSON.stringify(basis)}.` };
  }

  if (spec.outcome !== outcome) {
    return {
      ok: false,
      error:
        `"${spec.label}" is a basis for ${OUTCOME_LABEL[spec.outcome].toLowerCase()}, ` +
        `not ${OUTCOME_LABEL[outcome].toLowerCase()}.`,
    };
  }

  if (spec.requiresEntitySize && !opts.entitySizeDeterminationId) {
    return {
      ok: false,
      error:
        "Claiming very small importer status needs a recorded three-year average on file. " +
        "Add an entity size determination for your organization first.",
    };
  }

  return { ok: true, spec };
}

/**
 * § 1.500 very small importer thresholds, in US dollars, averaged over the
 * previous three years. FDA adjusts these for inflation, so they are a starting
 * point for the UI to warn against — not an automatic disqualification. The
 * determination is the importer's to make and a QI's to sign.
 */
export const VERY_SMALL_IMPORTER_THRESHOLD: Record<"human" | "animal", number> = {
  human: 1_000_000,
  animal: 2_500_000,
};

/** True when a determination is currently in force. */
export function isDeterminationLive(
  d: { expires_at: string | null; superseded_at: string | null },
  on: Date = new Date()
): boolean {
  if (d.superseded_at) return false;
  if (!d.expires_at) return true;
  return d.expires_at >= on.toISOString().slice(0, 10);
}

// ── Lookup ─────────────────────────────────────────────────────────────────

type SupabaseLike = { from: (table: string) => any };

export type LiveDetermination = {
  id: string;
  outcome: ApplicabilityOutcome;
  basis: string;
  citation: string;
  rationale: string;
  expires_at: string | null;
  superseded_at: string | null;
  determined_at: string;
};

/**
 * The determination currently governing a supplier/product pair, expired or
 * not — callers need to tell "never determined" apart from "determination has
 * lapsed", and the two block with different messages.
 *
 * Takes the client as a parameter so this module stays importable from client
 * components, which need the basis tables for the form.
 */
export async function fetchDetermination(
  supabase: SupabaseLike,
  importerId: string,
  supplierId: string,
  productId: string
): Promise<LiveDetermination | null> {
  const { data } = await (supabase.from("fsvp_applicability_determinations") as any)
    .select("id, outcome, basis, citation, rationale, expires_at, superseded_at, determined_at")
    .eq("importer_id", importerId)
    .eq("supplier_id", supplierId)
    .eq("product_id", productId)
    .is("superseded_at", null)
    .maybeSingle();

  return (data as LiveDetermination | null) ?? null;
}

/** Why a determination stops an FSVP record existing, or null if it does not. */
export function recordCreationBlock(d: LiveDetermination | null): string | null {
  if (!d) {
    return "Determine whether FSVP applies to this food before opening a record for it.";
  }
  if (d.outcome === "exempt") {
    const spec = basisSpec(d.basis);
    return (
      `This food is exempt from FSVP${spec ? ` — ${spec.label}` : ""} under ${d.citation}, ` +
      "so it does not need an FSVP record. The determination is the record."
    );
  }
  if (!isDeterminationLive(d)) {
    return (
      `The applicability determination for this food expired on ${d.expires_at}. ` +
      "A qualified individual must make a current one before the record can proceed."
    );
  }
  return null;
}

/** A refusal the reader can act on: why, and the screen that clears it. */
export type RecordCreationAction = {
  reason: string;
  href: string;
  cta: string;
};

/**
 * The same block as `recordCreationBlock`, paired with somewhere to go.
 *
 * Separated from the component that renders it for the reason
 * lib/auth/entity-access.ts gives: a decision tangled up with Supabase calls
 * is a decision nothing can test. This one is pure, so the table of cases
 * lives in applicability.test.ts.
 *
 * Everything routes to /applicability, including the exempt case — the
 * determination is on that screen whether the reader needs to make one or
 * only to read it. Only the label changes, because telling someone to
 * "determine applicability" for a food already determined exempt asks for
 * work that is done.
 */
export function recordCreationAction(d: LiveDetermination | null): RecordCreationAction | null {
  const reason = recordCreationBlock(d);
  if (!reason) return null;

  return {
    reason,
    href: "/applicability",
    cta: d?.outcome === "exempt" ? "View determination" : "Determine applicability",
  };
}
