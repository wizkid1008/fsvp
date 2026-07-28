import { describe, expect, it } from "vitest";
import { calculateScore, sectionCompletionPercent } from "./engine";
import type {
  ApprovalThresholdRow,
  EvidenceRow,
  RequirementItemRow,
  SectionScore,
  SectionWeight,
} from "./types";

// Mirrors the default thresholds seeded in supabase/migrations/021_rules_engine_schema_extensions.sql
const THRESHOLDS: ApprovalThresholdRow[] = [
  { min_score: 90, max_score: 100, resulting_status: "importer_approved" },
  { min_score: 75, max_score: 89, resulting_status: "conditionally_approved" },
  { min_score: 60, max_score: 74, resulting_status: "needs_corrective_action" },
  { min_score: 0, max_score: 59, resulting_status: "rejected" },
];

function weight(section_key: string, weight_percent: number): SectionWeight {
  return { section_id: section_key, section_key, section_name: section_key, applies_to: "facility", weight_percent };
}

function item(overrides: Partial<RequirementItemRow> & Pick<RequirementItemRow, "id" | "section_id">): RequirementItemRow {
  return {
    item_key: overrides.id,
    item_name: overrides.id,
    is_required: true,
    is_critical_blocker: false,
    auto_accept: false,
    expiration_applies: false,
    ...overrides,
  };
}

function accepted(requirement_item_id: string, expiration_date: string | null = null): EvidenceRow {
  return { requirement_item_id, evidence_status: "accepted", expiration_date };
}

describe("calculateScore", () => {
  it("scores a fully-satisfied single-section record as importer_approved", () => {
    const weights = [weight("identity", 100)];
    const items = [
      item({ id: "i1", section_id: "identity" }),
      item({ id: "i2", section_id: "identity" }),
    ];
    const evidence = [accepted("i1"), accepted("i2")];

    const result = calculateScore(weights, items, evidence, THRESHOLDS);

    expect(result.overall_score).toBe(100);
    expect(result.approval_status).toBe("importer_approved");
    expect(result.critical_blockers_present).toBe(false);
  });

  it("caps a fully-satisfied score at conditionally_approved when a critical blocker is missing", () => {
    const weights = [weight("hazard", 100)];
    const items = [
      item({ id: "required-1", section_id: "hazard" }),
      item({ id: "critical-1", section_id: "hazard", is_critical_blocker: true, is_required: false }),
    ];
    // The critical item isn't required for the raw score, but its absence still blocks full approval.
    const evidence = [accepted("required-1")];

    const result = calculateScore(weights, items, evidence, THRESHOLDS);

    expect(result.overall_score).toBe(100);
    expect(result.critical_blockers_present).toBe(true);
    expect(result.approval_status).toBe("conditionally_approved");
  });

  it("does not cap a status that's already below importer_approved", () => {
    const weights = [weight("hazard", 100)];
    const items = [
      item({ id: "required-1", section_id: "hazard" }),
      item({ id: "required-2", section_id: "hazard" }),
      item({ id: "critical-1", section_id: "hazard", is_critical_blocker: true }),
    ];
    // 1 of 3 required items satisfied -> raw score ~33, well under any cap concern.
    const evidence = [accepted("required-1")];

    const result = calculateScore(weights, items, evidence, THRESHOLDS);

    expect(result.critical_blockers_present).toBe(true);
    expect(result.approval_status).toBe("rejected");
  });

  it("treats expired evidence on expiration-sensitive items as unsatisfied", () => {
    const weights = [weight("certs", 100)];
    const items = [
      item({ id: "cert-1", section_id: "certs", expiration_applies: true }),
    ];
    const evidence = [accepted("cert-1", "2000-01-01")]; // expired long ago

    const result = calculateScore(weights, items, evidence, THRESHOLDS);

    expect(result.overall_score).toBe(0);
    expect(result.section_scores.certs.missing_count).toBe(1);
  });

  it("auto-accepts items with no evidence when auto_accept is true", () => {
    const weights = [weight("optional", 100)];
    const items = [item({ id: "auto-1", section_id: "optional", auto_accept: true })];

    const result = calculateScore(weights, items, [], THRESHOLDS);

    expect(result.overall_score).toBe(100);
  });

  it("gives a section with zero required items a full raw score", () => {
    const weights = [weight("empty", 50), weight("filled", 50)];
    const items = [item({ id: "f1", section_id: "filled" })];
    const evidence = [accepted("f1")];

    const result = calculateScore(weights, items, evidence, THRESHOLDS);

    expect(result.section_scores.empty.raw_score).toBe(100);
    expect(result.overall_score).toBe(100);
  });

  it("falls back to not_approved when no threshold covers the score", () => {
    const weights = [weight("solo", 100)];
    const items = [item({ id: "i1", section_id: "solo" })];
    const gappyThresholds: ApprovalThresholdRow[] = [
      { min_score: 50, max_score: 100, resulting_status: "importer_approved" },
    ];

    const result = calculateScore(weights, items, [], gappyThresholds);

    expect(result.overall_score).toBe(0);
    expect(result.approval_status).toBe("not_approved");
  });

  it("weights sections proportionally into the overall score", () => {
    const weights = [weight("heavy", 80), weight("light", 20)];
    const items = [
      item({ id: "h1", section_id: "heavy" }),
      item({ id: "l1", section_id: "light" }),
    ];
    // Only the light (20%) section is satisfied.
    const evidence = [accepted("l1")];

    const result = calculateScore(weights, items, evidence, THRESHOLDS);

    expect(result.overall_score).toBe(20);
  });
});

describe("sectionCompletionPercent", () => {
  const base: SectionScore = {
    section_key: "s",
    section_name: "s",
    weight_percent: 100,
    raw_score: 0,
    weighted_contribution: 0,
    required_count: 4,
    accepted_count: 0,
    missing_count: 4,
    critical_blocker_missing: false,
  };

  it("is 100 when there are no required items", () => {
    expect(sectionCompletionPercent({ ...base, required_count: 0 })).toBe(100);
  });

  it("is 0 when nothing is accepted yet", () => {
    expect(sectionCompletionPercent({ ...base, accepted_count: 0 })).toBe(0);
  });

  it("is 25 when fewer than half the required items are accepted", () => {
    expect(sectionCompletionPercent({ ...base, accepted_count: 1 })).toBe(25);
  });

  it("is 50 when at least half but not all are accepted", () => {
    expect(sectionCompletionPercent({ ...base, accepted_count: 2 })).toBe(50);
  });

  it("is 75 when all accepted but a critical blocker is still missing", () => {
    expect(sectionCompletionPercent({ ...base, accepted_count: 4, critical_blocker_missing: true })).toBe(75);
  });

  it("is 100 when fully satisfied with no blockers", () => {
    expect(sectionCompletionPercent({ ...base, accepted_count: 4, critical_blocker_missing: false })).toBe(100);
  });
});
