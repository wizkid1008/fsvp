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
    key: "qi_qualifications",
    title: "Qualified individual qualifications",
    citation: "21 CFR 1.503",
    why:
      "Evidence of the education, training or experience that makes each qualified individual " +
      "qualified. The register records which basis applies; this is the CV, certificate or course " +
      "record behind it. A signature is only as good as the standing of whoever made it.",
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
  {
    key: "importer_identification",
    title: "Importer identification at entry",
    citation: "21 CFR 1.509",
    why:
      "The D-U-N-S number transmitted as the FSVP importer identifier at entry, and evidence it is " +
      "current. Filed under the wrong identifier, an otherwise complete FSVP does not attach to " +
      "the shipment it was built for.",
    required: true,
  },
  {
    key: "hazard_analysis_reliance",
    title: "Reliance on another entity's hazard analysis",
    citation: "21 CFR 1.504(a)",
    why:
      "Only if you rely on a hazard analysis someone else conducted — a supplier, a co-packer, a " +
      "third party. You must review and assess it, and document that you did. Not required if you " +
      "conduct your own.",
    required: false,
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
