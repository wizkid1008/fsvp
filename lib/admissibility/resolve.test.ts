import { describe, expect, it } from "vitest";
import {
  conditionsOf,
  isCurrent,
  resolveRule,
  specificity,
  type ResolutionQuery,
  type RuleRow,
} from "./resolve";

const TODAY = "2026-08-11";
const PAST = "2026-01-01";
const FUTURE = "2027-01-01";

function rule(over: Partial<RuleRow> = {}): RuleRow {
  return {
    id: "r1",
    commodity_id: "c-mango",
    // Verified by default so each test can break exactly one thing; the draft
    // and source-moved paths get their own cases below.
    verification_status: "verified",
    source_changed_at: null,
    origin_country: "MX",
    origin_region: null,
    intended_use: "any",
    processing_state: "any",
    admissibility: "permitted",
    permit_required: false,
    phyto_required: false,
    treatment_required: false,
    peq_required: false,
    additional_declarations: null,
    designated_ports: null,
    conditions_text: null,
    citation: "7 CFR 319.56",
    source_url: "https://www.aphis.usda.gov/",
    reviewed_at: PAST,
    review_due_at: FUTURE,
    effective_from: PAST,
    effective_to: null,
    superseded_at: null,
    ...over,
  };
}

function query(over: Partial<ResolutionQuery> = {}): ResolutionQuery {
  return {
    commodityId: "c-mango",
    originCountry: "MX",
    intendedUse: "consumption",
    processingState: "fresh",
    on: TODAY,
    ...over,
  };
}

describe("specificity", () => {
  it("ranks intended use above processing state", () => {
    // Intended use changes the governing regime; processing state is a
    // condition within one.
    const byUse = rule({ intended_use: "consumption", processing_state: "any" });
    const byState = rule({ intended_use: "any", processing_state: "fresh" });
    expect(specificity(byUse)).toBeGreaterThan(specificity(byState));
  });

  it("ranks a country rule above any use or state combination", () => {
    const country = rule({ origin_country: "MX", intended_use: "any", processing_state: "any" });
    const regionSpecific = rule({
      origin_country: null, origin_region: "South America",
      intended_use: "consumption", processing_state: "fresh",
    });
    expect(specificity(country)).toBeGreaterThan(specificity(regionSpecific));
  });
});

describe("resolveRule — the happy path", () => {
  it("resolves a single covering rule", () => {
    const r = resolveRule([rule()], query());
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.rule.id).toBe("r1");
  });

  it("prefers the more specific rule", () => {
    const general = rule({ id: "general", admissibility: "permitted" });
    const specific = rule({
      id: "specific", intended_use: "consumption", processing_state: "fresh",
      admissibility: "restricted",
    });
    const r = resolveRule([general, specific], query());
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.rule.id).toBe("specific");
  });

  it("ignores rules for other commodities, countries, uses and states", () => {
    const noise = [
      rule({ id: "other-commodity", commodity_id: "c-avocado" }),
      rule({ id: "other-country", origin_country: "PE" }),
      rule({ id: "other-use", intended_use: "propagation" }),
      rule({ id: "other-state", processing_state: "dried" }),
      rule({ id: "match" }),
    ];
    const r = resolveRule(noise, query());
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.rule.id).toBe("match");
  });

  it("breaks a specificity tie by the more recent review", () => {
    const stale = rule({ id: "stale", reviewed_at: "2026-02-01" });
    const fresh = rule({ id: "fresh", reviewed_at: "2026-07-01" });
    const r = resolveRule([stale, fresh], query());
    if (r.status === "resolved") expect(r.rule.id).toBe("fresh");
  });
});

describe("resolveRule — what it refuses to do", () => {
  it("refuses to resolve against an overdue rule", () => {
    // The rule may still be correct. What has expired is our warrant for
    // saying so.
    const overdue = rule({ review_due_at: "2026-06-01" });
    const r = resolveRule([overdue], query());
    expect(r.status).toBe("manual_review");
    if (r.status === "manual_review") {
      expect(r.reasons[0]).toContain("2026-06-01");
      expect(r.reasons[0]).toContain("7 CFR 319.56");
    }
  });

  it("does not silently skip a region rule it cannot evaluate", () => {
    // No country-to-region mapping exists, so a prohibition scoped to a region
    // cannot be tested against a country. Ignoring it would let a prohibition
    // quietly fail to apply.
    const region = rule({
      id: "region", origin_country: null, origin_region: "South America",
      admissibility: "prohibited",
    });
    const r = resolveRule([region], query({ originCountry: "PE" }));
    expect(r.status).toBe("manual_review");
    if (r.status === "manual_review") expect(r.reasons[0]).toContain("South America");
  });

  it("lets a region rule block even when a country rule would permit", () => {
    const region = rule({ id: "region", origin_country: null, origin_region: "South America", admissibility: "prohibited" });
    const country = rule({ id: "country", origin_country: "PE", admissibility: "permitted" });
    const r = resolveRule([region, country], query({ originCountry: "PE" }));
    expect(r.status).toBe("manual_review");
  });

  it("reports no_rule distinctly from manual_review", () => {
    // "We hold nothing" and "we hold something we cannot rely on" call for
    // different actions from the reader.
    const r = resolveRule([], query());
    expect(r.status).toBe("no_rule");
  });

  it("refuses a rule that was not in force on the date asked about", () => {
    const notYet = rule({ effective_from: "2026-12-01" });
    expect(resolveRule([notYet], query()).status).toBe("manual_review");

    const expired = rule({ effective_to: "2026-03-01" });
    expect(resolveRule([expired], query()).status).toBe("manual_review");

    const superseded = rule({ superseded_at: "2026-05-01T00:00:00Z" });
    expect(resolveRule([superseded], query()).status).toBe("manual_review");
  });

  it("refuses to resolve against a draft rule", () => {
    // A draft is not the same as nothing: somebody wrote a rule here and
    // nobody has checked it.
    const draft = rule({ verification_status: "draft" });
    const r = resolveRule([draft], query());
    expect(r.status).toBe("manual_review");
    if (r.status === "manual_review") expect(r.reasons[0]).toContain("draft");
  });

  it("lets a draft prohibition block rather than being stepped over by silence", () => {
    // The same error as ignoring an unevaluable region rule: treating a draft
    // as absent would let a drafted prohibition quietly fail to apply.
    const draftProhibition = rule({
      id: "draft", verification_status: "draft", admissibility: "prohibited",
      intended_use: "consumption", processing_state: "fresh",
    });
    const verifiedGeneral = rule({ id: "general", admissibility: "permitted" });
    const r = resolveRule([draftProhibition, verifiedGeneral], query());
    expect(r.status).toBe("manual_review");
  });

  it("refuses when the source behind every covering rule has moved", () => {
    const moved = rule({ source_changed_at: "2026-07-02T00:00:00Z" });
    const r = resolveRule([moved], query());
    expect(r.status).toBe("manual_review");
    if (r.status === "manual_review") expect(r.reasons[0]).toContain("2026-07-02");
  });

  it("still resolves when one covering rule has moved and another has not", () => {
    const moved = rule({ id: "moved", source_changed_at: "2026-07-02T00:00:00Z" });
    const intact = rule({ id: "intact" });
    const r = resolveRule([moved, intact], query());
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.rule.id).toBe("intact");
  });

  it("refuses when two equally specific rules disagree", () => {
    const a = rule({ id: "a", admissibility: "permitted", citation: "7 CFR 319.56" });
    const b = rule({ id: "b", admissibility: "prohibited", citation: "7 CFR 319.37" });
    const r = resolveRule([a, b], query());
    expect(r.status).toBe("manual_review");
    if (r.status === "manual_review") expect(r.reasons[0]).toContain("disagree");
  });

  it("does not call it a conflict when equally specific rules agree", () => {
    const a = rule({ id: "a", admissibility: "restricted" });
    const b = rule({ id: "b", admissibility: "restricted" });
    expect(resolveRule([a, b], query()).status).toBe("resolved");
  });
});

describe("isCurrent", () => {
  it("is false for a draft, however recently reviewed", () => {
    expect(isCurrent(rule({ verification_status: "draft" }), TODAY)).toBe(false);
  });

  it("is false once change detection has seen the source move", () => {
    expect(isCurrent(rule({ source_changed_at: "2026-07-02T00:00:00Z" }), TODAY)).toBe(false);
  });

  it("is false once overdue, even while in force", () => {
    expect(isCurrent(rule({ review_due_at: "2026-06-01" }), TODAY)).toBe(false);
    expect(isCurrent(rule({ review_due_at: FUTURE }), TODAY)).toBe(true);
  });

  it("is false when superseded or outside the effective window", () => {
    expect(isCurrent(rule({ superseded_at: "2026-05-01T00:00:00Z" }), TODAY)).toBe(false);
    expect(isCurrent(rule({ effective_from: "2026-12-01" }), TODAY)).toBe(false);
    expect(isCurrent(rule({ effective_to: "2026-03-01" }), TODAY)).toBe(false);
  });
});

describe("conditionsOf", () => {
  it("turns the boolean flags into things a person can act on", () => {
    const conditions = conditionsOf(rule({
      permit_required: true,
      phyto_required: true,
      treatment_required: true,
      peq_required: true,
      additional_declarations: ["Free from Anastrepha ludens"],
      designated_ports: ["Otay Mesa", "Nogales"],
      conditions_text: "Cold treatment T107-a applies.",
    }));

    expect(conditions.join(" ")).toContain("permit");
    expect(conditions.join(" ")).toContain("phytosanitary");
    expect(conditions.join(" ")).toContain("Post-entry quarantine");
    expect(conditions.join(" ")).toContain("Anastrepha ludens");
    expect(conditions.join(" ")).toContain("Otay Mesa");
    expect(conditions.join(" ")).toContain("T107-a");
  });

  it("returns nothing for an unconditional rule", () => {
    expect(conditionsOf(rule())).toEqual([]);
  });
});
