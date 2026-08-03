import { describe, expect, it } from "vitest";
import {
  APPLICABILITY_BASES,
  basesForOutcome,
  basisSpec,
  isApplicabilityOutcome,
  isDeterminationLive,
  validateBasis,
} from "./applicability";

describe("APPLICABILITY_BASES", () => {
  it("gives every basis a citation and a distinct key", () => {
    const keys = new Set<string>();
    for (const b of APPLICABILITY_BASES) {
      expect(b.citation).toMatch(/^21 CFR 1\.5\d\d/);
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(0);
      expect(keys.has(b.basis)).toBe(false);
      keys.add(b.basis);
    }
  });

  it("cites § 1.501 for every exemption and §§ 1.511-1.513 for every modification", () => {
    for (const b of basesForOutcome("exempt")) {
      expect(b.citation).toContain("1.501");
    }
    for (const b of basesForOutcome("modified")) {
      expect(b.citation).toMatch(/1\.51[123]/);
    }
    expect(basesForOutcome("in_scope").map((b) => b.basis)).toEqual(["standard"]);
  });

  it("marks only very small importer as needing substantiation", () => {
    const needing = APPLICABILITY_BASES.filter((b) => b.requiresEntitySize).map((b) => b.basis);
    expect(needing).toEqual(["very_small_importer"]);
  });
});

describe("isApplicabilityOutcome", () => {
  it("accepts the three outcomes and nothing else", () => {
    expect(isApplicabilityOutcome("in_scope")).toBe(true);
    expect(isApplicabilityOutcome("exempt")).toBe(true);
    expect(isApplicabilityOutcome("modified")).toBe(true);
    expect(isApplicabilityOutcome("out_of_scope")).toBe(false);
    expect(isApplicabilityOutcome(undefined)).toBe(false);
  });
});

describe("validateBasis", () => {
  it("accepts a basis that matches its outcome and returns the citation", () => {
    const result = validateBasis("exempt", "seafood_haccp");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.citation).toBe("21 CFR 1.501(b)");
  });

  it("rejects a basis used under the wrong outcome, and says which is which", () => {
    const result = validateBasis("exempt", "very_small_importer", {
      entitySizeDeterminationId: "e1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("modified requirements");
    expect(result.error).toContain("exempt");
  });

  it("rejects an unknown basis", () => {
    const result = validateBasis("exempt", "because_we_said_so");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Unknown basis");
  });

  it("rejects an unknown outcome", () => {
    expect(validateBasis("maybe", "standard").ok).toBe(false);
  });

  it("refuses a very small importer claim with nothing behind it", () => {
    const without = validateBasis("modified", "very_small_importer");
    expect(without.ok).toBe(false);
    if (without.ok) return;
    expect(without.error).toContain("three-year average");

    const withRecord = validateBasis("modified", "very_small_importer", {
      entitySizeDeterminationId: "e1",
    });
    expect(withRecord.ok).toBe(true);
  });

  it("does not demand substantiation for the other modified bases", () => {
    expect(validateBasis("modified", "recognized_country_system").ok).toBe(true);
    expect(validateBasis("modified", "dietary_supplement").ok).toBe(true);
    expect(validateBasis("modified", "small_foreign_supplier").ok).toBe(true);
  });
});

describe("basisSpec", () => {
  it("returns null rather than throwing on an unknown basis", () => {
    expect(basisSpec("nonsense")).toBeNull();
  });
});

describe("isDeterminationLive", () => {
  const on = new Date("2026-07-31T12:00:00Z");

  it("is live with no expiry", () => {
    expect(isDeterminationLive({ expires_at: null, superseded_at: null }, on)).toBe(true);
  });

  it("is live up to and including the expiry date", () => {
    expect(isDeterminationLive({ expires_at: "2026-07-31", superseded_at: null }, on)).toBe(true);
    expect(isDeterminationLive({ expires_at: "2026-08-01", superseded_at: null }, on)).toBe(true);
  });

  it("is not live once expired", () => {
    expect(isDeterminationLive({ expires_at: "2026-07-30", superseded_at: null }, on)).toBe(false);
  });

  it("is not live once superseded, whatever the expiry says", () => {
    expect(
      isDeterminationLive({ expires_at: "2030-01-01", superseded_at: "2026-07-01T00:00:00Z" }, on)
    ).toBe(false);
  });
});
