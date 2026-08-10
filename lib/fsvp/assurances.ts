/**
 * Written assurances under 21 CFR 1.507, and when one is actually required.
 *
 * § 1.507 covers the case where a hazard requiring a control is NOT controlled
 * before the food reaches the United States. The importer may rely on a
 * customer or an entity further down the distribution chain — but only against
 * a written assurance, renewed at least annually, carrying an effective date
 * and the signature of an authorised official (§ 1.507(b)).
 *
 * The category matters because each one demands a DIFFERENT assurance, and the
 * wrong one is worth nothing. An assurance that a customer follows preventive
 * control procedures does not substitute for an assurance that the food will be
 * processed to control the hazard further down the chain. So the category is
 * enumerated and the citation is written server-side from this table, never
 * taken from the client — the same rule applied to applicability bases in
 * ./applicability.
 */

export type AssuranceCategory =
  | "customer_preventive_controls"
  | "customer_food_safety_compliance"
  | "downstream_processing"
  | "rac_no_assurance_required"
  | "importer_controlled";

export type AssuranceSpec = {
  category: AssuranceCategory;
  label: string;
  citation: string;
  /** What the importer is relying on, in plain words. */
  description: string;
  /** The substance the assurance itself must state. */
  requiredStatement: string;
  /** False for the two categories that rely on nobody. */
  needsCounterparty: boolean;
};

export const ASSURANCE_CATEGORIES: AssuranceSpec[] = [
  {
    category: "customer_preventive_controls",
    label: "Customer subject to preventive controls",
    citation: "21 CFR 1.507(a)(2)",
    description:
      "The importer's customer is subject to the preventive controls requirements of part 117 or " +
      "part 507 and will control the hazard.",
    requiredStatement:
      "That the customer has established and is following procedures, identified in the assurance, " +
      "that will significantly minimize or prevent the hazard.",
    needsCounterparty: true,
  },
  {
    category: "customer_food_safety_compliance",
    label: "Customer not subject to preventive controls",
    citation: "21 CFR 1.507(a)(3)",
    description:
      "The importer's customer is not subject to those preventive controls requirements, but will " +
      "still manufacture or process the food in a way that addresses the hazard.",
    requiredStatement:
      "That the customer is manufacturing, processing or preparing the food in accordance with " +
      "applicable food safety requirements.",
    needsCounterparty: true,
  },
  {
    category: "downstream_processing",
    label: "Entity further down the distribution chain",
    citation: "21 CFR 1.507(a)(4)",
    description:
      "The hazard will be controlled by an entity further down the distribution chain rather than " +
      "by the importer's immediate customer, with the disclosure passed along the chain.",
    requiredStatement:
      "That the food will be processed to control the hazard by an identified entity in the " +
      "distribution chain, and that the disclosure statement will be passed on as required.",
    needsCounterparty: true,
  },
  {
    category: "rac_no_assurance_required",
    label: "Raw agricultural commodity for further processing",
    citation: "21 CFR 1.507(a)(1)",
    description:
      "A raw agricultural commodity intended for further distribution or processing, where the " +
      "regulation requires no written assurance.",
    requiredStatement:
      "No written assurance is required. Record why the food falls in this category instead.",
    needsCounterparty: false,
  },
  {
    category: "importer_controlled",
    label: "Controlled by the importer",
    citation: "21 CFR 1.507(a)(5)",
    description:
      "The importer itself will control the hazard, or has established and follows a system that " +
      "ensures it is controlled.",
    requiredStatement:
      "No counterparty assurance is required. Document the importer's own system of control.",
    needsCounterparty: false,
  },
];

const BY_CATEGORY = new Map(ASSURANCE_CATEGORIES.map((a) => [a.category, a]));

export function assuranceSpec(category: string): AssuranceSpec | null {
  return BY_CATEGORY.get(category as AssuranceCategory) ?? null;
}

/** Categories that stand on somebody else's promise and so need renewing. */
export function reliesOnCounterparty(category: string): boolean {
  return assuranceSpec(category)?.needsCounterparty === true;
}

export type AssuranceValidation =
  | { ok: true; spec: AssuranceSpec }
  | { ok: false; error: string };

/**
 * Checks the category is real and that a category relying on someone else names
 * them. Called by the API before insert; the citation comes from here.
 */
export function validateAssurance(
  category: unknown,
  opts: { counterpartyName?: string | null; signatoryName?: string | null } = {}
): AssuranceValidation {
  const spec = assuranceSpec(String(category));
  if (!spec) {
    return { ok: false, error: `Unknown assurance category ${JSON.stringify(category)}.` };
  }

  if (spec.needsCounterparty) {
    if (!opts.counterpartyName?.trim()) {
      return {
        ok: false,
        error:
          `"${spec.label}" means relying on somebody else to control the hazard. ` +
          "Name the party giving the assurance.",
      };
    }
    if (!opts.signatoryName?.trim()) {
      return {
        ok: false,
        error:
          // § 1.507(b), not the (a)(N) paragraph the category comes from: the
          // paragraphs under (a) say WHICH assurance is needed, while (b) is
          // what every assurance must carry — effective date, printed name and
          // the signature of an authorised official.
          "21 CFR 1.507(b) requires the assurance to carry the printed name and signature of an " +
          "authorised official. Record who signed it.",
      };
    }
  }

  return { ok: true, spec };
}

/**
 * The reliance paragraphs of § 1.507(a) each require the assurance to be
 * renewed at least annually, so an assurance with no end date would quietly
 * become permanent. Used as the default when none is given.
 */
export const ASSURANCE_VALIDITY_DAYS = 365;

export function defaultExpiry(from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + ASSURANCE_VALIDITY_DAYS);
  return d.toISOString().slice(0, 10);
}

export type AssuranceRow = {
  category: string;
  expires_at: string;
  superseded_at: string | null;
};

/** True when the assurance is in force on the given day. */
export function isAssuranceLive(a: AssuranceRow, on: Date = new Date()): boolean {
  if (a.superseded_at) return false;
  return a.expires_at >= on.toISOString().slice(0, 10);
}

/**
 * Why an assurance blocks approval, or null when it does not.
 *
 * Only the three reliance categories can block: the other two assert that
 * nobody else's promise is being relied on, so there is nothing to lapse.
 */
export function assuranceBlock(assurances: AssuranceRow[]): string | null {
  const reliant = assurances.filter((a) => !a.superseded_at && reliesOnCounterparty(a.category));
  if (reliant.length === 0) return null;

  const lapsed = reliant.filter((a) => !isAssuranceLive(a));
  if (lapsed.length === 0) return null;

  const spec = assuranceSpec(lapsed[0].category);
  return (
    `A written assurance this record relies on expired on ${lapsed[0].expires_at}` +
    (spec ? ` (${spec.label}, ${spec.citation})` : "") +
    ". § 1.507 requires it to be renewed at least annually before the food can continue to be imported on that basis."
  );
}
