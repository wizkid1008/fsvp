import { describe, expect, it } from "vitest";
import { countEvidenceStandings, documentBucket, evidenceNextStep, evidenceStanding } from "./evidence-standing";

const progress = (p: Partial<{ required: number; accepted: number; awaitingReview: number; needsAttention: number; missing: number }>) => ({
  required: 0, accepted: 0, awaitingReview: 0, needsAttention: 0, missing: 0, ...p,
});

describe("evidenceStanding", () => {
  it("puts something sent back ahead of something missing", () => {
    expect(evidenceStanding(progress({ required: 5, needsAttention: 1, missing: 3, accepted: 1 }))).toBe("returned");
  });

  it("puts missing ahead of waiting on the importer", () => {
    expect(evidenceStanding(progress({ required: 5, missing: 1, awaitingReview: 4 }))).toBe("missing");
  });

  it("is waiting on the importer once everything is in and nothing was sent back", () => {
    expect(evidenceStanding(progress({ required: 5, awaitingReview: 2, accepted: 3 }))).toBe("awaiting");
  });

  it("is complete when every required document is accepted", () => {
    expect(evidenceStanding(progress({ required: 3, accepted: 3 }))).toBe("complete");
  });

  it("says nothing is required rather than complete when nothing is", () => {
    expect(evidenceStanding(progress({}))).toBe("none");
    expect(evidenceStanding(undefined)).toBe("none");
  });
});

describe("evidenceNextStep", () => {
  it("names the exporter's own work, and nothing when the wait is on the importer", () => {
    expect(evidenceNextStep(progress({ required: 4, needsAttention: 2, missing: 1 }))).toBe("Fix 2 sent back");
    expect(evidenceNextStep(progress({ required: 4, missing: 3, accepted: 1 }))).toBe("Upload 3 missing");
    expect(evidenceNextStep(progress({ required: 4, awaitingReview: 4 }))).toBeNull();
    expect(evidenceNextStep(progress({ required: 4, accepted: 4 }))).toBeNull();
  });
});

describe("countEvidenceStandings", () => {
  it("counts each product once, in its most pressing bucket", () => {
    const counts = countEvidenceStandings([
      progress({ required: 2, needsAttention: 1, missing: 1 }),
      progress({ required: 2, missing: 2 }),
      progress({ required: 2, accepted: 2 }),
      undefined,
    ]);
    expect(counts).toEqual({ total: 4, returned: 1, missing: 1, awaiting: 0, complete: 1 });
  });
});

describe("documentBucket", () => {
  const today = "2026-10-01";
  it("files sent-back and in-review documents first", () => {
    expect(documentBucket({ evidence_status: "needs_revision", expiration_date: null }, today)).toBe("returned");
    expect(documentBucket({ evidence_status: "rejected", expiration_date: null }, today)).toBe("returned");
    expect(documentBucket({ evidence_status: "under_review", expiration_date: "2026-10-02" }, today)).toBe("awaiting");
  });

  it("flags an accepted document lapsing within 60 days, or already lapsed", () => {
    expect(documentBucket({ evidence_status: "accepted", expiration_date: "2026-11-15" }, today)).toBe("expiring");
    expect(documentBucket({ evidence_status: "accepted", expiration_date: "2026-09-01" }, today)).toBe("expiring");
    expect(documentBucket({ evidence_status: "accepted", expiration_date: "2027-06-01" }, today)).toBe("accepted");
    expect(documentBucket({ evidence_status: "accepted", expiration_date: null }, today)).toBe("accepted");
  });
});
