import { describe, expect, it } from "vitest";
import {
  addMonths,
  isValidDecision,
  isValidReassessmentMonths,
  statusForDecision,
  VALID_DECISIONS,
} from "./status-transitions";

describe("isValidDecision", () => {
  it("accepts every known decision", () => {
    for (const decision of VALID_DECISIONS) {
      expect(isValidDecision(decision)).toBe(true);
    }
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isValidDecision("approve")).toBe(false); // close but not the real value
    expect(isValidDecision("")).toBe(false);
    expect(isValidDecision(undefined)).toBe(false);
    expect(isValidDecision(null)).toBe(false);
    expect(isValidDecision(42)).toBe(false);
  });
});

describe("statusForDecision", () => {
  it("maps each decision to the correct fsvp_records status", () => {
    expect(statusForDecision("approved")).toBe("importer_approved");
    expect(statusForDecision("conditionally_approved")).toBe("conditionally_approved");
    expect(statusForDecision("rejected")).toBe("rejected");
    expect(statusForDecision("revision_requested")).toBe("needs_corrective_action");
  });
});

describe("isValidReassessmentMonths", () => {
  it("allows undefined (falls back to the default)", () => {
    expect(isValidReassessmentMonths(undefined)).toBe(true);
  });

  it("allows the boundary values 1 and 120", () => {
    expect(isValidReassessmentMonths(1)).toBe(true);
    expect(isValidReassessmentMonths(120)).toBe(true);
  });

  it("rejects out-of-range values", () => {
    expect(isValidReassessmentMonths(0)).toBe(false);
    expect(isValidReassessmentMonths(121)).toBe(false);
    expect(isValidReassessmentMonths(-5)).toBe(false);
  });
});

describe("addMonths", () => {
  it("adds whole months to an ISO date", () => {
    expect(addMonths("2026-01-15T00:00:00.000Z", 3).slice(0, 10)).toBe("2026-04-15");
  });

  it("rolls over into the next year", () => {
    expect(addMonths("2026-11-01T00:00:00.000Z", 3).slice(0, 10)).toBe("2027-02-01");
  });

  it("handles the default 12-month reassessment cycle", () => {
    expect(addMonths("2026-07-28T00:00:00.000Z", 12).slice(0, 10)).toBe("2027-07-28");
  });
});
