import { describe, expect, it } from "vitest";
import {
  evaluateAttestations,
  hashAttestationContent,
  isAttestationType,
  REQUIRED_ATTESTATION_TYPES,
  type AttestationInput,
  type AttestationRecordInput,
} from "./qi-attestation";

const RECORD: AttestationRecordInput = {
  hazard_analysis_notes: "Salmonella is a known hazard for this commodity.",
  supplier_evaluation_notes: "Supplier holds a current GFSI certificate.",
  verification_determination: "Annual onsite audit, plus COA per lot.",
};

/** Signs every required section against the record as it currently stands. */
async function fullySigned(record: AttestationRecordInput): Promise<AttestationInput[]> {
  return [
    {
      attestation_type: "hazard_analysis",
      content_hash: await hashAttestationContent(record.hazard_analysis_notes),
      revoked_at: null,
    },
    {
      attestation_type: "supplier_evaluation",
      content_hash: await hashAttestationContent(record.supplier_evaluation_notes),
      revoked_at: null,
    },
    {
      attestation_type: "verification_determination",
      content_hash: await hashAttestationContent(record.verification_determination),
      revoked_at: null,
    },
  ];
}

describe("hashAttestationContent", () => {
  it("is stable across calls", async () => {
    const a = await hashAttestationContent("some determination");
    const b = await hashAttestationContent("some determination");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores surrounding whitespace and line-ending style", async () => {
    const base = await hashAttestationContent("line one\nline two");
    expect(await hashAttestationContent("  line one\nline two  ")).toBe(base);
    expect(await hashAttestationContent("line one\r\nline two")).toBe(base);
  });

  it("changes when the wording changes", async () => {
    const a = await hashAttestationContent("Annual onsite audit.");
    const b = await hashAttestationContent("Biennial onsite audit.");
    expect(a).not.toBe(b);
  });

  it("treats null and empty string alike", async () => {
    expect(await hashAttestationContent(null)).toBe(await hashAttestationContent(""));
  });
});

describe("isAttestationType", () => {
  it("accepts the four known types and rejects anything else", () => {
    for (const t of REQUIRED_ATTESTATION_TYPES) expect(isAttestationType(t)).toBe(true);
    expect(isAttestationType("reassessment")).toBe(true);
    expect(isAttestationType("hazard")).toBe(false);
    expect(isAttestationType(undefined)).toBe(false);
  });
});

describe("evaluateAttestations", () => {
  it("passes when all three sections are signed against the current text", async () => {
    const result = await evaluateAttestations(RECORD, await fullySigned(RECORD));
    expect(result.satisfied).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.state).toEqual({
      hazard_analysis: "signed",
      supplier_evaluation: "signed",
      verification_determination: "signed",
    });
  });

  it("blocks when nothing has been signed", async () => {
    const result = await evaluateAttestations(RECORD, []);
    expect(result.satisfied).toBe(false);
    expect(result.reasons).toHaveLength(3);
    expect(result.reasons.every((r) => r.includes("not been signed"))).toBe(true);
  });

  it("blocks when one required section is missing a signature", async () => {
    const signed = (await fullySigned(RECORD)).filter(
      (a) => a.attestation_type !== "supplier_evaluation"
    );
    const result = await evaluateAttestations(RECORD, signed);
    expect(result.satisfied).toBe(false);
    expect(result.state.supplier_evaluation).toBe("missing");
    expect(result.state.hazard_analysis).toBe("signed");
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain("§ 1.505");
  });

  it("blocks when the narrative was edited after signing", async () => {
    const signed = await fullySigned(RECORD);
    const edited = { ...RECORD, verification_determination: "Annual onsite audit only." };

    const result = await evaluateAttestations(edited, signed);
    expect(result.satisfied).toBe(false);
    expect(result.state.verification_determination).toBe("stale");
    expect(result.reasons[0]).toContain("changed since it was signed");
  });

  it("clears the staleness once the QI signs the new text", async () => {
    const edited = { ...RECORD, verification_determination: "Annual onsite audit only." };
    const stale = await fullySigned(RECORD);
    const resigned = [
      ...stale,
      {
        attestation_type: "verification_determination" as const,
        content_hash: await hashAttestationContent(edited.verification_determination),
        revoked_at: null,
      },
    ];

    const result = await evaluateAttestations(edited, resigned);
    expect(result.satisfied).toBe(true);
  });

  it("ignores revoked attestations", async () => {
    const signed = (await fullySigned(RECORD)).map((a) =>
      a.attestation_type === "hazard_analysis"
        ? { ...a, revoked_at: "2026-07-30T00:00:00Z" }
        : a
    );

    const result = await evaluateAttestations(RECORD, signed);
    expect(result.satisfied).toBe(false);
    expect(result.state.hazard_analysis).toBe("missing");
  });

  it("reports an undocumented narrative rather than asking for a signature on nothing", async () => {
    const empty = { ...RECORD, hazard_analysis_notes: "   " };
    const result = await evaluateAttestations(empty, await fullySigned(RECORD));
    expect(result.satisfied).toBe(false);
    expect(result.state.hazard_analysis).toBe("missing");
    expect(result.reasons[0]).toContain("not been documented");
  });

  it("does not require a reassessment attestation to approve", async () => {
    const result = await evaluateAttestations(RECORD, await fullySigned(RECORD));
    expect(result.satisfied).toBe(true);
  });
});
