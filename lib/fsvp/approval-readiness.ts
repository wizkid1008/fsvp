/**
 * What stands between an FSVP record and an approval, as sentences.
 *
 * The record page lists these above the submit and approval forms, the
 * approve route refuses on them, and the submit route records whichever are
 * still open when a record is handed to the importer. The three are:
 *
 *   - a live applicability determination (lib/fsvp/applicability.ts)
 *   - current QI attestations over the narratives it requires (§ 1.503)
 *   - the migration 010 gates: suspension, § 1.506(d), § 1.507 (lib/fsvp/gates.ts)
 *
 * The approve route additionally scores the record synchronously. That is left
 * to the decision itself: it is the expensive check, and it can fail for
 * reasons that say nothing about whether the preparer's work is done.
 */

import { fetchDetermination, isDeterminationLive } from "@/lib/fsvp/applicability";
import { evaluateAttestations } from "@/lib/fsvp/qi-attestation";
import { evaluateGates } from "@/lib/fsvp/gates";

export type ReadinessRecord = {
  id: string;
  importer_id: string;
  supplier_id: string;
  product_id: string;
  hazard_analysis_notes: string | null;
  supplier_evaluation_notes: string | null;
  verification_determination: string | null;
};

export async function approvalBlockers(
  admin: { from: (table: string) => any },
  record: ReadinessRecord
): Promise<string[]> {
  const { data: attestationRows, error: attestationError } = await (admin.from("qi_attestations") as any)
    .select("attestation_type, content_hash, revoked_at")
    .eq("fsvp_record_id", record.id);

  // Fail closed: an unreadable signature table cannot be taken as a signed one.
  if (attestationError) {
    return [
      "The qualified individual attestations could not be read, so § 1.503 coverage cannot be confirmed. " +
        attestationError.message,
    ];
  }

  const determination = await fetchDetermination(
    admin, record.importer_id, record.supplier_id, record.product_id
  );
  const live = determination ? isDeterminationLive(determination) : false;

  const reasons: string[] = [];
  if (!determination) {
    reasons.push(
      "Nobody has determined whether FSVP applies to this food. A qualified individual must do that before the record can be approved."
    );
  } else if (!live) {
    reasons.push(
      `The applicability determination for this food expired on ${determination.expires_at}. A qualified individual must make a current one.`
    );
  }

  const outcome = live ? determination!.outcome : null;
  const attestations = await evaluateAttestations(record, attestationRows ?? [], outcome);
  reasons.push(...attestations.reasons);

  const gates = await evaluateGates(admin, {
    importerId:   record.importer_id,
    supplierId:   record.supplier_id,
    fsvpRecordId: record.id,
    outcome,
  });
  reasons.push(...gates.map((b) => b.message));

  return reasons;
}
