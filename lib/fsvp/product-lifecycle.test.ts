import { describe, expect, it } from "vitest";
import {
  isOutstandingWork,
  isWithinRetention,
  lifecycleExplanation,
  planTransition,
  retentionEndsOn,
} from "./product-lifecycle";

describe("isOutstandingWork", () => {
  it("counts only active products", () => {
    expect(isOutstandingWork({ lifecycle: "active", discontinuedOn: null })).toBe(true);
    expect(isOutstandingWork({ lifecycle: "not_imported", discontinuedOn: null })).toBe(false);
    expect(isOutstandingWork({ lifecycle: "discontinued", discontinuedOn: "2026-01-01" })).toBe(false);
  });
});

describe("retentionEndsOn", () => {
  it("runs two years from the date importing stopped", () => {
    // Not from when somebody got round to recording it — 21 CFR 1.510(b)(1).
    expect(retentionEndsOn({ lifecycle: "discontinued", discontinuedOn: "2026-03-15" }))
      .toBe("2028-03-15");
  });

  it("has no end date for an active product", () => {
    expect(retentionEndsOn({ lifecycle: "active", discontinuedOn: null })).toBeNull();
  });

  it("has nothing to retain for a product never imported", () => {
    // No obligation ever attached, so there is no clock to run.
    expect(retentionEndsOn({ lifecycle: "not_imported", discontinuedOn: null })).toBeNull();
  });

  it("handles a leap day without producing an invalid date", () => {
    expect(retentionEndsOn({ lifecycle: "discontinued", discontinuedOn: "2028-02-29" }))
      .toBe("2030-03-01");
  });
});

describe("isWithinRetention", () => {
  it("keeps records through the final day", () => {
    const p = { lifecycle: "discontinued" as const, discontinuedOn: "2026-03-15" };
    expect(isWithinRetention(p, "2028-03-15")).toBe(true);
    expect(isWithinRetention(p, "2028-03-16")).toBe(false);
  });

  it("treats an active product as always within retention", () => {
    expect(isWithinRetention({ lifecycle: "active", discontinuedOn: null }, "2099-01-01")).toBe(true);
  });

  it("treats a never-imported product as holding nothing", () => {
    expect(isWithinRetention({ lifecycle: "not_imported", discontinuedOn: null })).toBe(false);
  });
});

describe("planTransition", () => {
  const base = { from: "active" as const, everImported: false, today: "2026-08-14" };

  it("refuses a no-op", () => {
    const result = planTransition({ ...base, to: "active" });
    expect(result).toEqual({ ok: false, reason: "This product is already in that state." });
  });

  it("allows marking a never-sourced product as not imported", () => {
    // The reported case: created before the supplier relationship existed and
    // never actually sourced.
    expect(planTransition({ ...base, to: "not_imported" }))
      .toEqual({ ok: true, discontinuedOn: null });
  });

  it("REFUSES not_imported for a food that has been imported", () => {
    // The one change here that would destroy a record FSVP requires. The
    // platform cannot know the answer, so the caller asserts it and this
    // refuses when the assertion says the food was imported.
    const result = planTransition({ ...base, to: "not_imported", everImported: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("1.510");
      expect(result.reason).toContain("discontinued instead");
    }
  });

  it("requires the date importing stopped", () => {
    const result = planTransition({ ...base, to: "discontinued", everImported: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("runs from that date");
  });

  it("refuses a future discontinuation date", () => {
    const result = planTransition({
      ...base, to: "discontinued", everImported: true, discontinuedOn: "2026-09-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("cannot be in the future");
  });

  it("accepts a past date and keeps it as given", () => {
    expect(planTransition({
      ...base, to: "discontinued", everImported: true, discontinuedOn: "2026-05-01",
    })).toEqual({ ok: true, discontinuedOn: "2026-05-01" });
  });

  it("accepts today as the stop date", () => {
    expect(planTransition({
      ...base, to: "discontinued", everImported: true, discontinuedOn: "2026-08-14",
    })).toEqual({ ok: true, discontinuedOn: "2026-08-14" });
  });

  it("clears the retention date when importing resumes", () => {
    // The obligation is live again, so the clock is abandoned rather than
    // left to expire against a date that no longer means anything.
    expect(planTransition({
      from: "discontinued", to: "active", everImported: true, today: "2026-08-14",
    })).toEqual({ ok: true, discontinuedOn: null });
  });
});

describe("lifecycleExplanation", () => {
  it("names the retention end date so the reason is checkable", () => {
    const text = lifecycleExplanation({ lifecycle: "discontinued", discontinuedOn: "2026-03-15" });
    expect(text).toContain("2028-03-15");
    expect(text).toContain("1.510");
  });

  it("says a never-imported product is not outstanding work", () => {
    expect(lifecycleExplanation({ lifecycle: "not_imported", discontinuedOn: null }))
      .toContain("not counted as outstanding work");
  });
});
