/**
 * Choosing which country-commodity rule governs a product.
 *
 * The reference layer (migration 012) stores rules at varying specificity: a
 * rule may name an intended use and processing state, or leave either as 'any'.
 * Resolution picks the most specific rule that covers the case, the way a
 * regulation itself would be read — a rule about dried mango for processing
 * beats a general rule about mango.
 *
 * Two things this module refuses to do, both for the same reason. The rules
 * table is curated by hand from agency publications that have no API, so its
 * failure mode is not "no answer" but "a confident answer nobody checked":
 *
 *   1. It will not resolve against an OVERDUE rule. Past its review date the
 *      rule may still be correct, but our warrant for saying so has expired.
 *   2. It will not silently ignore a REGION rule it cannot evaluate. There is
 *      no country-to-region mapping in the schema, so a rule scoped to
 *      "South America" cannot be matched against "Peru" programmatically.
 *      Skipping it would mean a prohibition quietly failing to apply, so an
 *      unevaluable region rule forces manual review instead.
 *
 * Pure — no database access — so the judgement can be tested directly.
 */

export type IntendedUse = "any" | "consumption" | "processing" | "propagation" | "research";
export type ProcessingState = "any" | "fresh" | "frozen" | "dried" | "cooked" | "canned" | "other";
export type Admissibility = "permitted" | "restricted" | "prohibited";

export type RuleRow = {
  id: string;
  commodity_id: string;
  /** Only a verified rule may support a determination — migration 014. */
  verification_status: "draft" | "verified";
  /** Set when change detection sees the underlying text move. */
  source_changed_at: string | null;
  origin_country: string | null;
  origin_region: string | null;
  intended_use: IntendedUse;
  processing_state: ProcessingState;
  admissibility: Admissibility;
  permit_required: boolean;
  phyto_required: boolean;
  treatment_required: boolean;
  peq_required: boolean;
  additional_declarations: string[] | null;
  designated_ports: string[] | null;
  conditions_text: string | null;
  citation: string;
  source_url: string;
  reviewed_at: string;
  review_due_at: string;
  effective_from: string;
  effective_to: string | null;
  superseded_at: string | null;
};

export type ResolutionQuery = {
  commodityId: string;
  originCountry: string;
  intendedUse: Exclude<IntendedUse, "any">;
  processingState: Exclude<ProcessingState, "any">;
  /** The day the determination is being made for. */
  on?: string;
};

export type Resolution =
  | { status: "resolved"; rule: RuleRow; specificity: number }
  /** A rule exists but cannot be relied on. Names which, and why. */
  | { status: "manual_review"; reasons: string[]; candidates: RuleRow[] }
  /** Nothing on file at all. */
  | { status: "no_rule"; reasons: string[] };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Superseded, or outside its effective window on the day asked about. */
function isInForce(rule: RuleRow, on: string): boolean {
  if (rule.superseded_at) return false;
  if (rule.effective_from > on) return false;
  if (rule.effective_to && rule.effective_to < on) return false;
  return true;
}

/** In force, verified, unmoved at source, and re-checked recently enough. */
export function isCurrent(rule: RuleRow, on: string = today()): boolean {
  return rule.verification_status === "verified"
    && rule.source_changed_at === null
    && isInForce(rule, on)
    && rule.review_due_at >= on;
}

/**
 * How closely a rule targets the case. Higher wins.
 *
 * Intended use is weighted above processing state because it changes the
 * governing regime rather than the handling: propagative material is a
 * different regulatory question from food, whereas fresh versus dried is a
 * condition within one.
 */
export function specificity(rule: RuleRow): number {
  let score = 0;
  if (rule.origin_country) score += 4;
  if (rule.intended_use !== "any") score += 2;
  if (rule.processing_state !== "any") score += 1;
  return score;
}

function covers(rule: RuleRow, q: ResolutionQuery): boolean {
  if (rule.commodity_id !== q.commodityId) return false;
  if (rule.intended_use !== "any" && rule.intended_use !== q.intendedUse) return false;
  if (rule.processing_state !== "any" && rule.processing_state !== q.processingState) return false;
  return true;
}

/**
 * Picks the rule governing a query, or explains why no determination can be
 * made from what is on file.
 *
 * `manual_review` is deliberately distinct from `no_rule`. "We hold a rule and
 * cannot rely on it" and "we hold nothing" call for different actions from the
 * person reading the screen, and collapsing them would hide a stale prohibition
 * behind the same message as an empty table.
 */
export function resolveRule(rules: RuleRow[], q: ResolutionQuery): Resolution {
  const on = q.on ?? today();
  const forCommodity = rules.filter((r) => r.commodity_id === q.commodityId);

  // Region rules first, because an unevaluable one blocks everything else. A
  // region prohibition we cannot test must not be stepped over by a country
  // rule that happens to permit.
  const regionCandidates = forCommodity.filter(
    (r) => r.origin_region && !r.origin_country && isInForce(r, on) && covers(r, q)
  );

  if (regionCandidates.length > 0) {
    return {
      status: "manual_review",
      reasons: [
        `This commodity has ${regionCandidates.length} rule${regionCandidates.length === 1 ? "" : "s"} ` +
        `scoped to a region (${[...new Set(regionCandidates.map((r) => r.origin_region))].join(", ")}) ` +
        `rather than a country. The platform holds no country-to-region mapping, so it cannot tell ` +
        `whether ${q.originCountry} falls inside. Check by hand before determining admissibility — ` +
        `one of these may prohibit or restrict this movement.`,
      ],
      candidates: regionCandidates,
    };
  }

  const countryMatches = forCommodity.filter(
    (r) => r.origin_country === q.originCountry && covers(r, q)
  );

  if (countryMatches.length === 0) {
    return {
      status: "no_rule",
      reasons: [
        `No country-commodity rule is on file for this commodity from ${q.originCountry} ` +
        `(${q.intendedUse}, ${q.processingState}). Admissibility cannot be determined from the ` +
        `reference layer; it has to be established against the agency and recorded as a rule first.`,
      ],
    };
  }

  const inForce = countryMatches.filter((r) => isInForce(r, on));
  if (inForce.length === 0) {
    return {
      status: "manual_review",
      reasons: [
        "Every rule on file for this commodity and origin is superseded or outside its effective " +
        "dates. A determination cannot be made from a rule that was not in force on the date asked about.",
      ],
      candidates: countryMatches,
    };
  }

  // A draft is not the same as nothing. Somebody has written a rule here and
  // it has not been checked — and it may be a prohibition. Treating drafts as
  // absent would let a drafted prohibition be stepped over by silence, which
  // is the same error as ignoring an unevaluable region rule.
  const drafts = inForce.filter((r) => r.verification_status !== "verified");
  if (drafts.length > 0) {
    return {
      status: "manual_review",
      reasons: [
        `${drafts.length} rule${drafts.length === 1 ? " covering" : "s covering"} this movement ` +
        `${drafts.length === 1 ? "is" : "are"} still a draft. A rule is not usable because somebody ` +
        `typed it — it has to be confirmed against the source by someone other than its author ` +
        `before a determination can rest on it.`,
      ],
      candidates: inForce,
    };
  }

  // Change detection has seen the underlying text move since this was verified.
  // Different from expiry: the ground shifted rather than time passing.
  const moved = inForce.filter((r) => r.source_changed_at !== null);
  if (moved.length > 0 && moved.length === inForce.length) {
    return {
      status: "manual_review",
      reasons: [
        `The source behind every rule covering this movement has changed since it was verified ` +
        `(first seen ${moved[0].source_changed_at?.slice(0, 10)}). Re-read ${moved[0].citation} and ` +
        `verify again before determining admissibility.`,
      ],
      candidates: inForce,
    };
  }

  // Overdue is the case this whole module exists for. The rule is in force and
  // may well be right; what has lapsed is the review that lets us assert it.
  const usable = inForce.filter((r) => r.source_changed_at === null);
  const current = usable.filter((r) => r.review_due_at >= on);
  if (current.length === 0) {
    const worst = [...usable].sort((a, b) => a.review_due_at.localeCompare(b.review_due_at))[0];
    return {
      status: "manual_review",
      reasons: [
        `The rule governing this movement was due for review on ${worst.review_due_at} and has not ` +
        `been re-checked. It may still be correct, but it cannot be presented as authoritative. ` +
        `Verify it against ${worst.citation} and record the review before determining admissibility.`,
      ],
      candidates: inForce,
    };
  }

  // Ranking only ever sees verified, unmoved, in-force, in-review rules. Every
  // other state has already returned above with a reason a person can act on.
  const ranked = [...current].sort((a, b) => {
    const bySpecificity = specificity(b) - specificity(a);
    if (bySpecificity !== 0) return bySpecificity;
    // Same specificity: the more recently reviewed rule is the better warrant.
    return b.reviewed_at.localeCompare(a.reviewed_at);
  });

  // Two rules of equal specificity that disagree is a data fault, not a
  // decision to make silently. The unique index in 012 prevents it for live
  // rules, so reaching here means something predates that constraint.
  const top = ranked[0];
  const rivals = ranked.filter(
    (r) => specificity(r) === specificity(top) && r.admissibility !== top.admissibility
  );
  if (rivals.length > 0) {
    return {
      status: "manual_review",
      reasons: [
        `Two rules of equal specificity disagree about this movement ` +
        `(${top.admissibility} per ${top.citation}, ${rivals[0].admissibility} per ${rivals[0].citation}). ` +
        `Resolve the conflict in the reference layer before determining admissibility.`,
      ],
      candidates: ranked,
    };
  }

  return { status: "resolved", rule: top, specificity: specificity(top) };
}

/**
 * The conditions a resolved rule imposes, as a list a person can act on.
 * Snapshotted onto the determination so it survives the rule being superseded.
 */
export function conditionsOf(rule: RuleRow): string[] {
  const out: string[] = [];
  if (rule.permit_required)    out.push("An import permit is required before shipment.");
  if (rule.phyto_required)     out.push("A phytosanitary certificate from the origin authority is required.");
  if (rule.treatment_required) out.push("An approved treatment is required, with its certificate.");
  if (rule.peq_required)       out.push("Post-entry quarantine is required.");
  for (const d of rule.additional_declarations ?? []) {
    out.push(`Additional declaration required: ${d}`);
  }
  if (rule.designated_ports?.length) {
    out.push(`Entry is restricted to designated ports: ${rule.designated_ports.join(", ")}.`);
  }
  if (rule.conditions_text?.trim()) out.push(rule.conditions_text.trim());
  return out;
}
