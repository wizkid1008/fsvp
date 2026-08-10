import { describe, expect, it } from "vitest";
import {
  ASSURANCE_CATEGORIES,
  assuranceBlock,
  assuranceSpec,
  defaultExpiry,
  isAssuranceLive,
  reliesOnCounterparty,
  validateAssurance,
} from "./assurances";

const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const NEXT_YEAR = new Date(Date.now() + 300 * 86_400_000).toISOString().slice(0, 10);

describe("ASSURANCE_CATEGORIES", () => {
  it("cites a paragraph of § 1.507 for every category, with distinct keys", () => {
    const keys = new Set<string>();
    for (const a of ASSURANCE_CATEGORIES) {
      expect(a.citation).toMatch(/^21 CFR 1\.507\(a\)\(\d\)$/);
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.requiredStatement.length).toBeGreaterThan(0);
      expect(keys.has(a.category)).toBe(false);
      keys.add(a.category);
    }
  });

  it("marks exactly the three reliance categories as needing a counterparty", () => {
    // (a)(1) raw agricultural commodity and (a)(5) importer-controlled rely on
    // nobody, so there is no assurance to obtain or renew.
    const needing = ASSURANCE_CATEGORIES.filter((a) => a.needsCounterparty).map((a) => a.category);
    expect(needing.sort()).toEqual([
      "customer_food_safety_compliance",
      "customer_preventive_controls",
      "downstream_processing",
    ]);
  });
});

describe("validateAssurance", () => {
  it("rejects an unknown category", () => {
    const r = validateAssurance("made_up");
    expect(r.ok).toBe(false);
  });

  it("requires a counterparty for a reliance category", () => {
    const r = validateAssurance("customer_preventive_controls", { signatoryName: "A. Official" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Name the party");
  });

  it("requires a signatory, because § 1.507(b) requires a signed assurance", () => {
    const r = validateAssurance("downstream_processing", { counterpartyName: "Acme Foods" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("1.507(b)");
  });

  it("accepts a complete reliance assurance and returns its citation", () => {
    const r = validateAssurance("customer_preventive_controls", {
      counterpartyName: "Acme Foods",
      signatoryName: "A. Official",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.citation).toBe("21 CFR 1.507(a)(2)");
  });

  it("accepts the non-reliance categories with no counterparty at all", () => {
    expect(validateAssurance("rac_no_assurance_required").ok).toBe(true);
    expect(validateAssurance("importer_controlled").ok).toBe(true);
  });
});

describe("isAssuranceLive", () => {
  it("is false once expired and false once superseded", () => {
    expect(isAssuranceLive({ category: "downstream_processing", expires_at: YESTERDAY, superseded_at: null })).toBe(false);
    expect(isAssuranceLive({ category: "downstream_processing", expires_at: NEXT_YEAR, superseded_at: "2026-01-01" })).toBe(false);
  });

  it("is true while in force", () => {
    expect(isAssuranceLive({ category: "downstream_processing", expires_at: NEXT_YEAR, superseded_at: null })).toBe(true);
  });
});

describe("assuranceBlock", () => {
  it("does not block when there are no assurances at all", () => {
    // Not every record relies on someone else. Absence is not a lapse.
    expect(assuranceBlock([])).toBeNull();
  });

  it("does not block on an expired non-reliance category", () => {
    // "Importer controlled" asserts that nobody else's promise is being relied
    // on, so there is nothing to lapse — blocking on it would be nonsense.
    expect(
      assuranceBlock([{ category: "importer_controlled", expires_at: YESTERDAY, superseded_at: null }])
    ).toBeNull();
  });

  it("blocks on an expired reliance assurance and names the date and citation", () => {
    const msg = assuranceBlock([
      { category: "customer_preventive_controls", expires_at: YESTERDAY, superseded_at: null },
    ]);
    expect(msg).not.toBeNull();
    expect(msg).toContain(YESTERDAY);
    expect(msg).toContain("1.507");
  });

  it("does not block while a reliance assurance is still in force", () => {
    expect(
      assuranceBlock([{ category: "downstream_processing", expires_at: NEXT_YEAR, superseded_at: null }])
    ).toBeNull();
  });

  it("ignores superseded rows", () => {
    expect(
      assuranceBlock([
        { category: "downstream_processing", expires_at: YESTERDAY, superseded_at: "2026-02-01" },
        { category: "downstream_processing", expires_at: NEXT_YEAR, superseded_at: null },
      ])
    ).toBeNull();
  });
});

describe("defaultExpiry", () => {
  it("defaults to a year out, since § 1.507(b) makes annual renewal the floor", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(defaultExpiry(from)).toBe("2027-01-01");
  });
});

describe("reliesOnCounterparty", () => {
  it("is false for an unknown category rather than throwing", () => {
    expect(reliesOnCounterparty("nonsense")).toBe(false);
  });

  it("agrees with the spec table", () => {
    for (const a of ASSURANCE_CATEGORIES) {
      expect(reliesOnCounterparty(a.category)).toBe(a.needsCounterparty);
      expect(assuranceSpec(a.category)).not.toBeNull();
    }
  });
});
