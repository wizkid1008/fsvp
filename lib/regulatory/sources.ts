/**
 * The FDA datasets we screen suppliers against, and what each one is worth.
 *
 * 21 CFR 1.505(a)(1)(iv) requires an importer evaluating a foreign supplier to
 * consider that supplier's compliance history. FDA publishes the underlying
 * datasets and, on its Firm/Supplier Evaluation Resources page, tells importers
 * to use these specific ones for this specific purpose. So the list below is
 * not our selection of convenient feeds — it is FDA's own answer to "what
 * should an importer look at".
 *
 * Every source carries its caveats in the same object as its endpoint, because
 * the caveats are the point. A refusal record does not mean a supplier is bad;
 * it means a shipment was refused, sometimes for a label defect, sometimes for
 * a product never intended for the US market. Presenting these as a verdict
 * would be a misuse of public data. The UI reads `caveat` from here and shows
 * it beside the findings rather than burying it in documentation nobody opens.
 */

export type RegulatorySourceId =
  | "fda_food_enforcement"
  | "fda_import_refusals"
  | "fda_inspections_classifications"
  | "fda_compliance_actions";

/** Datasets FDA names but publishes with no machine interface at all. */
export type ManualSourceId = "fda_import_alerts";

export type SourceAccess =
  /** Open REST. An API key raises the rate limit but is not required. */
  | "public"
  /** Requires FDA-issued credentials via the OII Unified Logon. */
  | "credentialed"
  /** No API exists. A person has to look. */
  | "manual";

export type RegulatorySourceSpec = {
  id: RegulatorySourceId | ManualSourceId;
  label: string;
  /** What the dataset actually contains, in the words we show a user. */
  description: string;
  access: SourceAccess;
  /** Where a reader can go and check us. */
  referenceUrl: string;
  /** How often FDA refreshes it, as FDA states it. */
  cadence: string;
  /**
   * What this data does NOT mean. Shown next to any finding drawn from it.
   * Sourced from FDA's own published disclaimers, not our interpretation.
   */
  caveat: string;
  /** True once this source is actually wired up. */
  implemented: boolean;
};

export const REGULATORY_SOURCES: RegulatorySourceSpec[] = [
  {
    id: "fda_food_enforcement",
    label: "Food recalls and enforcement reports",
    description:
      "Recall events from FDA's Recall Enterprise System, covering 2004 to present, with the " +
      "recalling firm, the reason for recall, and FDA's hazard classification.",
    access: "public",
    referenceUrl: "https://open.fda.gov/apis/food/enforcement/",
    cadence: "Weekly",
    caveat:
      "FDA does not update a recall's status after it has been classified, so a record here does " +
      "not show whether the recall was resolved. FDA also states this data must not be used as a " +
      "basis for issuing public alerts.",
    implemented: true,
  },
  {
    id: "fda_import_refusals",
    label: "Import refusals",
    description:
      "Shipments refused entry to the United States, with the firm, product code and the refusal " +
      "charges behind the decision.",
    access: "credentialed",
    referenceUrl: "https://datadashboard.fda.gov/oii/cd/imprefusals.htm",
    cadence:
      "FDA's own pages disagree — the refusals dashboard says weekly, the supplier-evaluation " +
      "page says monthly. Treat the retrieval date shown as the only reliable statement of age.",
    caveat:
      "Only final actions appear, so pending decisions are absent. FDA notes some refused " +
      "shipments were never intended for US sale or moved outside established supply chains, so a " +
      "refusal is not automatically a judgement on a supplier's normal trade.",
    implemented: true,
  },
  {
    id: "fda_inspections_classifications",
    label: "Inspection classifications",
    description:
      "The outcome FDA assigned to an inspection: NAI (no action indicated), VAI (voluntary " +
      "action indicated) or OAI (official action indicated).",
    access: "credentialed",
    referenceUrl: "https://datadashboard.fda.gov/oii/api/api-definitions-inspections.htm",
    cadence: "Not stated by FDA.",
    caveat:
      "A classification describes one inspection on one date. Absence of a record means FDA has " +
      "not inspected and published, not that a facility passed.",
    implemented: true,
  },
  {
    id: "fda_compliance_actions",
    label: "Warning letters and compliance actions",
    description:
      "Warning letters, seizures and injunctions recorded against a firm, with the action date " +
      "and FDA's establishment identifier.",
    access: "credentialed",
    referenceUrl: "https://datadashboard.fda.gov/oii/api/api-definitions-compliance-actions.htm",
    cadence: "Not stated by FDA.",
    caveat:
      "An action is a point-in-time record. It does not show whether the firm subsequently " +
      "corrected the problem to FDA's satisfaction.",
    implemented: true,
  },
  {
    id: "fda_import_alerts",
    label: "Import alerts",
    description:
      "Firms and products subject to detention without physical examination — FDA's Red, Yellow " +
      "and Green lists.",
    access: "manual",
    referenceUrl: "https://www.accessdata.fda.gov/cms_ia/",
    cadence: "Revised continuously, per alert.",
    caveat:
      "FDA publishes no API for import alerts. Nothing in this platform screens them, so a " +
      "supplier showing no findings here may still be on an import alert. This check has to be " +
      "performed by hand against FDA's site and recorded on the screening.",
    implemented: false,
  },
];

const BY_ID = new Map(REGULATORY_SOURCES.map((s) => [s.id, s]));

export function sourceSpec(id: string): RegulatorySourceSpec | null {
  return BY_ID.get(id as RegulatorySourceId) ?? null;
}

/** Sources we can ingest today, given the credentials actually configured. */
export function ingestableSources(env: {
  FDA_DATADASHBOARD_USER?: string;
  FDA_DATADASHBOARD_KEY?: string;
}): RegulatorySourceId[] {
  const hasDashboardCreds = Boolean(env.FDA_DATADASHBOARD_USER && env.FDA_DATADASHBOARD_KEY);

  return REGULATORY_SOURCES.filter((s): s is RegulatorySourceSpec & { id: RegulatorySourceId } => {
    if (!s.implemented) return false;
    if (s.access === "manual") return false;
    if (s.access === "credentialed") return hasDashboardCreds;
    return true;
  }).map((s) => s.id);
}

/**
 * The sources a screening could not cover, so the screening record can say so
 * rather than implying a clean sweep. An importer who screens without import
 * alerts has not done the whole job, and the record should admit it.
 */
export function unscreenedSources(covered: string[]): RegulatorySourceSpec[] {
  return REGULATORY_SOURCES.filter((s) => !covered.includes(s.id));
}

// ── Event vocabulary ────────────────────────────────────────────────────────

export type RegulatoryEventType =
  | "recall"
  | "import_refusal"
  | "inspection_classification"
  | "warning_letter"
  | "seizure"
  | "injunction"
  | "other_action";

export const EVENT_TYPE_LABEL: Record<RegulatoryEventType, string> = {
  recall:                    "Recall",
  import_refusal:            "Import refusal",
  inspection_classification: "Inspection outcome",
  warning_letter:            "Warning letter",
  seizure:                   "Seizure",
  injunction:                "Injunction",
  other_action:              "Compliance action",
};

/**
 * How much weight a finding deserves on the review queue. This orders the
 * reviewer's attention; it is not a score and never becomes one. A Class I
 * recall means a reasonable probability of serious harm, which is the one
 * finding that should interrupt someone's day.
 */
export function findingSeverity(
  eventType: string,
  classification: string | null
): "critical" | "warning" | "info" {
  // Anchored so "Class II" and "Class III" do not match as substrings of
  // "Class I" — the difference between them is the difference between a
  // reasonable probability of serious harm and a labelling defect.
  if (classification && /^\s*class\s+i\s*$/i.test(classification)) return "critical";

  if (eventType === "warning_letter" || eventType === "seizure" || eventType === "injunction") {
    return "critical";
  }
  // Official Action Indicated: FDA considered the findings significant enough
  // to warrant regulatory action.
  if (classification?.trim().toUpperCase() === "OAI") return "critical";

  if (eventType === "recall" || eventType === "import_refusal") return "warning";
  return "info";
}
