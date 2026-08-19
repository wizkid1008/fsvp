import { describe, expect, it } from "vitest";
import { applyAdmissibilityGate } from "./index";
import type { ScoreResult } from "./types";

const approved: ScoreResult = {
  overall_score: 96,
  approval_status: "importer_approved",
  critical_blockers_present: false,
  section_scores: {},
  section_scores_json: {},
};

describe("applyAdmissibilityGate", () => {
  it("does not alter a score with no admissibility blockers", () => {
    expect(applyAdmissibilityGate(approved, [])).toBe(approved);
  });

  it("does not fail a product solely because reference coverage is pending", () => {
    const result = applyAdmissibilityGate(approved, [{
      code: "determination_missing",
      message: "No determination.",
    }]);
    expect(result).toBe(approved);
  });

  it("prevents an evidence score from presenting a hard-blocked product as approved", () => {
    const result = applyAdmissibilityGate(approved, [{
      code: "prohibited",
      message: "Prohibited movement.",
    }]);
    expect(result.approval_status).toBe("not_approved");
    expect(result.critical_blockers_present).toBe(true);
    expect(result.overall_score).toBe(96);
  });
});
