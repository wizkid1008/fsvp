/**
 * The FSVP documents an importer must hold about ITSELF.
 *
 * Every other evidence surface in this platform is about a foreign supplier's
 * operation — their certifications, their facility, their product. These are
 * different: they establish that an FSVP exists at all, and they are what an
 * FDA investigator asks for before examining any individual record.
 *
 * Not the same thing as the per-record work. The hazard analysis (§ 1.504),
 * supplier evaluation (§ 1.505) and verification determination (§ 1.506(d)) are
 * decisions written into each fsvp_record and signed by a qualified individual.
 * What is listed here are standing documents, held once by the organization and
 * relied on across every record it owns.
 */

export type ImporterRecordKind = {
  key: string;
  /** What FSVP calls it, in the importer's words. */
  title: string;
  citation: string;
  why: string;
  /** Required outright, or only in certain circumstances. */
  required: boolean;
};

/**
 * Only what is genuinely held once by the organization. Three obligations used
 * to be listed here too, and each was in the wrong place:
 *
 *   § 1.503 QI qualifications — the CV or certificate behind ONE person's
 *     signature. One organization-wide slot could not say whose a file was;
 *     they are filed per person on the Qualified Individuals register now
 *     (documents.linked_entity_type = 'qualified_individual').
 *   § 1.509 importer identification — the D-U-N-S is held on the importer
 *     account already and printed on every inspection package. § 1.509 asks
 *     that it be transmitted at entry, not that a document about it be kept, so
 *     Company records shows the number on file instead of asking for a file.
 *   § 1.504(a) reliance on another entity's hazard analysis — decided per food,
 *     so it is on the FSVP record's hazard analysis, where the QI signs.
 */
export const IMPORTER_RECORD_KINDS: ImporterRecordKind[] = [
  {
    key: "approved_supplier_procedures",
    title: "Written procedures for using approved suppliers",
    citation: "21 CFR 1.506(b)",
    why:
      "The procedure that ensures food is imported only from foreign suppliers you have approved — " +
      "and, where necessary on a temporary basis, from unapproved ones whose food is subject to " +
      "adequate verification. FSVP requires the procedure to exist in writing and requires you to " +
      "document that you follow it.",
    required: true,
  },
  {
    key: "records_procedures",
    title: "Records maintenance procedures",
    citation: "21 CFR 1.510",
    why:
      "How FSVP records are signed and dated, kept for two years after you stop using a supplier, " +
      "held in English, and produced promptly when FDA asks. Electronic records must also meet " +
      "§ 1.510(b).",
    required: true,
  },
];

export type ImporterRecordStatus = {
  kind: ImporterRecordKind;
  documents: number;
  /** True when at least one document has been accepted, not merely uploaded. */
  satisfied: boolean;
};

/**
 * Match filed documents to the obligations they answer.
 *
 * `document_kind` carries the key, because these are filed by the importer
 * rather than mapped to a rule version's requirement items — the obligations
 * come from the regulation itself and do not vary by rule version the way
 * supplier evidence requirements do.
 */
export function summariseImporterRecords(
  documents: Array<{ document_kind: string | null; evidence_status: string | null }>
): ImporterRecordStatus[] {
  return IMPORTER_RECORD_KINDS.map((kind) => {
    const matching = documents.filter((d) => d.document_kind === kind.key);
    return {
      kind,
      documents: matching.length,
      satisfied: matching.some((d) => d.evidence_status === "accepted"),
    };
  });
}

/** How many required obligations still have no accepted document. */
export function outstandingRequired(statuses: ImporterRecordStatus[]): number {
  return statuses.filter((s) => s.kind.required && !s.satisfied).length;
}
