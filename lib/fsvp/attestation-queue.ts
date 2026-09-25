/**
 * What is waiting on a qualified individual's signature.
 *
 * QI attestation is a hard gate: /setup/fsvp lists unsigned records as
 * blockers, the importer dashboard counts them under "Records unsigned", and
 * the approve route refuses without them. But the person who actually signs —
 * a tenant-scoped reviewer, which is how an FSVP qualified individual holds a
 * login (004_reviewer_tenancy.sql) — had no such surface anywhere. They saw a
 * document review queue and a list of records, with nothing saying which ones
 * needed them.
 *
 * Scope comes from RLS rather than an explicit filter: a tenant reviewer sees
 * their own importer's records, a platform reviewer sees all of them. Pass the
 * user-scoped client, never the admin one.
 */

import { ATTESTATION_LABEL, evaluateAttestations, type AttestationInput } from "./qi-attestation";
import { isDeterminationLive, type ApplicabilityOutcome } from "./applicability";

type SupabaseLike = { from: (table: string) => any };

/** Statuses where a signature still changes the outcome. A rejected or
 *  approved record is not waiting on anyone. */
const OPEN_STATUSES = [
  "draft",
  "awaiting_supplier_evidence",
  "supplier_evidence_submitted",
  "supplier_evidence_accepted",
  "importer_review_pending",
  "needs_corrective_action",
  "reassessment_due",
  "conditionally_approved",
];

export type AttestationQueueItem = {
  recordId: string;
  productName: string | null;
  supplierName: string | null;
  status: string;
  /** What a QI can sign right now: unsigned or stale, never unwritten. */
  toSign: string[];
  /** Sections the importer has not written yet, so nothing exists to sign. */
  undocumented: string[];
};

export type AttestationQueue = {
  /** Records with at least one determination a QI can sign today. */
  signable: AttestationQueueItem[];
  /** Records blocked only on the importer writing the determinations. */
  waitingOnImporter: AttestationQueueItem[];
};

type RecordRow = {
  id: string;
  status: string;
  supplier_id: string;
  product_id: string;
  importer_id: string;
  hazard_analysis_notes: string | null;
  supplier_evaluation_notes: string | null;
  verification_determination: string | null;
  suppliers: { company_name: string } | null;
  products_verify: { product_name: string } | null;
};

export async function fetchAttestationQueue(
  supabase: SupabaseLike,
  limit = 12
): Promise<AttestationQueue> {
  const { data: rawRecords } = await (supabase.from("fsvp_records") as any)
    .select(
      "id, status, supplier_id, product_id, importer_id, " +
      "hazard_analysis_notes, supplier_evaluation_notes, verification_determination, " +
      "suppliers(company_name), products_verify(product_name)"
    )
    .in("status", OPEN_STATUSES)
    .order("created_at", { ascending: true });

  const records = (rawRecords ?? []) as RecordRow[];
  if (records.length === 0) return { signable: [], waitingOnImporter: [] };

  // Determinations and attestations in two bulk queries rather than two per
  // record — this runs on a dashboard, not a detail page.
  const [{ data: rawDeterminations }, { data: rawAttestations }] = await Promise.all([
    (supabase.from("fsvp_applicability_determinations") as any)
      .select("supplier_id, product_id, importer_id, outcome, expires_at, superseded_at")
      .is("superseded_at", null)
      .in("product_id", records.map((r) => r.product_id)),
    (supabase.from("qi_attestations") as any)
      .select("fsvp_record_id, attestation_type, content_hash, revoked_at")
      .in("fsvp_record_id", records.map((r) => r.id)),
  ]);

  // Keyed on the triple, because one product can be imported by more than one
  // importer and each holds its own determination.
  const determinationKey = (importerId: string, supplierId: string, productId: string) =>
    `${importerId}:${supplierId}:${productId}`;

  const outcomeByKey = new Map<string, ApplicabilityOutcome | null>();
  for (const row of (rawDeterminations ?? []) as Array<{
    supplier_id: string;
    product_id: string;
    importer_id: string;
    outcome: ApplicabilityOutcome;
    expires_at: string | null;
    superseded_at: string | null;
  }>) {
    // An expired determination is not a live one; fall back to null so
    // requiredTypesFor() asks for the full set rather than a relaxed one.
    if (!isDeterminationLive(row)) continue;
    outcomeByKey.set(determinationKey(row.importer_id, row.supplier_id, row.product_id), row.outcome);
  }

  const attestationsByRecord = new Map<string, AttestationInput[]>();
  for (const row of (rawAttestations ?? []) as Array<AttestationInput & { fsvp_record_id: string | null }>) {
    if (!row.fsvp_record_id) continue;
    const existing = attestationsByRecord.get(row.fsvp_record_id) ?? [];
    existing.push(row);
    attestationsByRecord.set(row.fsvp_record_id, existing);
  }

  const evaluated = await Promise.all(
    records.map(async (record) => {
      const outcome = outcomeByKey.get(
        determinationKey(record.importer_id, record.supplier_id, record.product_id)
      ) ?? null;

      const evaluation = await evaluateAttestations(
        record,
        attestationsByRecord.get(record.id) ?? [],
        outcome
      );

      return { record, evaluation };
    })
  );

  // evaluateAttestations emits exactly one reason per required type, each
  // starting with that type's label, so the label is enough to split them.
  const items = evaluated
    .filter(({ evaluation }) => !evaluation.satisfied)
    .map(({ record, evaluation }): AttestationQueueItem => {
      const unwritten = evaluation.undocumented.map((t) => ATTESTATION_LABEL[t]);
      const isUnwritten = (reason: string) => unwritten.some((label) => reason.startsWith(label));
      return {
        recordId: record.id,
        productName: record.products_verify?.product_name ?? null,
        supplierName: record.suppliers?.company_name ?? null,
        status: record.status,
        toSign: evaluation.reasons.filter((r) => !isUnwritten(r)),
        undocumented: evaluation.reasons.filter(isUnwritten),
      };
    });

  return {
    signable: items.filter((i) => i.toSign.length > 0).slice(0, limit),
    waitingOnImporter: items.filter((i) => i.toSign.length === 0).slice(0, limit),
  };
}
