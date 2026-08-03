import type { AttestationType, QiAttestation } from "@/types/database";

/**
 * The § 1.503 gate.
 *
 * A qualified individual must perform or oversee the hazard analysis (§ 1.504),
 * the foreign supplier evaluation (§ 1.505) and the verification activities
 * determination (§ 1.506). Approval is blocked until each carries a current,
 * unrevoked signature from a QI who was active when they signed.
 *
 * "Current" is the part that needs a hash. A signature attached to a narrative
 * that has since been edited attests to text that no longer exists, which is
 * worse than no signature at all — it reads as coverage in an FDA records
 * request while covering nothing. So each attestation snapshots the text and its
 * SHA-256, and the gate re-hashes the live narrative and compares.
 */

export const REQUIRED_ATTESTATION_TYPES = [
  "hazard_analysis",
  "supplier_evaluation",
  "verification_determination",
] as const satisfies readonly AttestationType[];

export type RequiredAttestationType = (typeof REQUIRED_ATTESTATION_TYPES)[number];

/**
 * What a record actually has to carry, given how FSVP applies to it.
 *
 * § 1.512 does not require a very small importer, or an importer of food from a
 * small foreign supplier, to conduct a hazard analysis or a supplier
 * evaluation — so demanding a signature on either would be asking a qualified
 * individual to sign work the regulation never called for. What § 1.512(b)(3)
 * does require is written assurance from the supplier, which is a verification
 * activity, so the verification determination is still signed.
 *
 * An exempt pair should not have a record at all (the creation gate in
 * /api/fsvp-records refuses one), but if a pre-existing record is exempt there
 * is nothing left to attest to.
 */
export function requiredTypesFor(
  outcome: "in_scope" | "modified" | "exempt" | null | undefined
): readonly RequiredAttestationType[] {
  if (outcome === "exempt") return [];
  if (outcome === "modified") return ["verification_determination"];
  // Null means no determination has been made. The record cannot be approved in
  // that state anyway — the approve route says so in its own words — so fall
  // back to the full set rather than silently relaxing anything.
  return REQUIRED_ATTESTATION_TYPES;
}

export const ATTESTATION_LABEL: Record<AttestationType, string> = {
  hazard_analysis: "Hazard analysis (§ 1.504)",
  supplier_evaluation: "Foreign supplier evaluation (§ 1.505)",
  verification_determination: "Verification activities determination (§ 1.506)",
  reassessment: "Reassessment (§ 1.508)",
  applicability_determination: "Applicability determination (§§ 1.501–1.513)",
};

/** The default wording a QI signs. Stored per row so it survives copy changes. */
export const DEFAULT_ATTESTATION_STATEMENT =
  "I am a qualified individual as defined in 21 CFR 1.500. I performed or oversaw this " +
  "determination, and the record above is accurate and complete to the best of my knowledge.";

export function isAttestationType(value: unknown): value is AttestationType {
  // Derived from the label map rather than repeated, so adding a type in one
  // place cannot leave the guard behind — which is exactly what happened when
  // applicability_determination was added.
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ATTESTATION_LABEL, value);
}

/**
 * SHA-256 of the narrative, via Web Crypto — available in the `edge` runtime
 * every route in this app uses, and in Node 18+ for the tests.
 *
 * Leading and trailing whitespace is trimmed and line endings normalised before
 * hashing so that a stray newline from a textarea does not read as a material
 * edit. Nothing else is normalised: a real wording change must invalidate.
 */
export async function hashAttestationContent(text: string | null | undefined): Promise<string> {
  const normalized = (text ?? "").replace(/\r\n/g, "\n").trim();
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type AttestationRecordInput = {
  hazard_analysis_notes: string | null;
  supplier_evaluation_notes: string | null;
  verification_determination: string | null;
};

export type AttestationInput = Pick<
  QiAttestation,
  "attestation_type" | "content_hash" | "revoked_at"
>;

export type AttestationEvaluation = {
  satisfied: boolean;
  /** Human-readable blocking reasons, safe to show the user verbatim. */
  reasons: string[];
  /** Per-type state, for rendering the sign-off panel. */
  state: Record<RequiredAttestationType, "signed" | "missing" | "stale" | "not_required">;
  /** Which types this record actually has to carry, given its applicability. */
  required: readonly RequiredAttestationType[];
};

function narrativeFor(record: AttestationRecordInput, type: RequiredAttestationType): string | null {
  switch (type) {
    case "hazard_analysis":
      return record.hazard_analysis_notes;
    case "supplier_evaluation":
      return record.supplier_evaluation_notes;
    case "verification_determination":
      return record.verification_determination;
  }
}

/**
 * Decides whether the record's QI coverage is complete and current.
 *
 * Pure apart from hashing, so the approve route and the record page can both
 * call it and agree on what is blocking.
 */
export async function evaluateAttestations(
  record: AttestationRecordInput,
  attestations: AttestationInput[],
  outcome?: "in_scope" | "modified" | "exempt" | null
): Promise<AttestationEvaluation> {
  const reasons: string[] = [];
  const state = {} as AttestationEvaluation["state"];
  const required = requiredTypesFor(outcome);

  for (const type of REQUIRED_ATTESTATION_TYPES) {
    if (!required.includes(type)) {
      state[type] = "not_required";
      continue;
    }

    const label = ATTESTATION_LABEL[type];
    const narrative = narrativeFor(record, type);

    if (!narrative || narrative.trim() === "") {
      state[type] = "missing";
      reasons.push(`${label} has not been documented.`);
      continue;
    }

    const live = await hashAttestationContent(narrative);
    const signed = attestations.filter((a) => a.attestation_type === type && a.revoked_at === null);

    if (signed.length === 0) {
      state[type] = "missing";
      reasons.push(`${label} has not been signed by a qualified individual.`);
      continue;
    }

    if (!signed.some((a) => a.content_hash === live)) {
      state[type] = "stale";
      reasons.push(
        `${label} has changed since it was signed. A qualified individual must sign it again.`
      );
      continue;
    }

    state[type] = "signed";
  }

  return { satisfied: reasons.length === 0, reasons, state, required };
}
