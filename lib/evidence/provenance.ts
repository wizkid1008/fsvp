/**
 * Who provided a piece of evidence, and what that means for the review queue.
 *
 * An FSVP record built on evidence the importer keyed in themselves is not the
 * same evidentiary artifact as one the supplier attested to, and an FDA
 * investigator reads the two differently — which is why `documents.evidence_source`
 * exists and why the inspection package prints it.
 *
 * Two consequences follow from the source, and they used to live inline in
 * /api/documents/upload. They are shared with the form-submission route now, so
 * uploads and completed forms cannot drift apart on the rule:
 *
 *   · Importer-provided evidence does not enter the review queue as `submitted`.
 *     Asking an importer to review their own upload is theatre, and it inflates
 *     the pending count with work that does not exist.
 *   · Importer-provided evidence records the importer as the reviewer, and
 *     stamps attested_at, so the record still says who stood behind it.
 */

export type EvidenceSource = "supplier_attested" | "importer_uploaded" | "third_party";
export type EvidenceStatus = "submitted" | "accepted";

export type ProvenanceInput = {
  /** profiles.supplier_id of whoever is submitting. Null for importer staff. */
  uploaderSupplierId: string | null | undefined;
  /** The supplier the evidence belongs to. */
  targetSupplierId: string;
  /** The submitting user's profile id. */
  uploaderProfileId: string;
  /** Who at the supplier furnished it, when an importer submits on their behalf. */
  attestedByName?: string | null;
  attestedAt?: string | null;
};

export type Provenance = {
  evidence_source: EvidenceSource;
  evidence_status: EvidenceStatus;
  reviewer_profile_id: string | null;
  attested_by_name: string | null;
  attested_at: string | null;
};

export function resolveProvenance(input: ProvenanceInput): Provenance {
  const uploaderIsSupplierSide =
    Boolean(input.uploaderSupplierId) && input.uploaderSupplierId === input.targetSupplierId;

  const source: EvidenceSource = uploaderIsSupplierSide ? "supplier_attested" : "importer_uploaded";
  const isImporterProvided = source === "importer_uploaded";

  return {
    evidence_source:     source,
    evidence_status:     isImporterProvided ? "accepted" : "submitted",
    reviewer_profile_id: isImporterProvided ? input.uploaderProfileId : null,
    attested_by_name:    input.attestedByName?.trim() || null,
    attested_at:         input.attestedAt || (isImporterProvided ? new Date().toISOString() : null),
  };
}
