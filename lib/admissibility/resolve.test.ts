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
  const merged: RuleRow = {
    id: "r1",
    commodity_id: "c-mango",
    // Verified by default so each test can break exactly one thing; the draft
    // and source-moved paths get their own cases below.
    verification_status: "verified",
    source_changed_at: null,
    origin_scope: "country",
    origin_country: "MX",
    origin_region: null,
    intended_use: "any",
    processing_state: "any",
    admissibility: "permitted",
    // Explicitly false, not null: the fixture rule is one whose source was read
    // and said no. Silence gets its own cases — see 026.
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

  // Scope follows the origin columns unless a test sets it, so the cases
  // written before 026 keep saying what they meant.
  return {
    ...merged,
    origin_scope:
      over.origin_scope ??
      (merged.origin_country ? "country" : merged.origin_region ? "region" : "global"),
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

// ── Migration 026: holding what ACIR actually says ─────────────────────────
// Each case here comes from a document in
// background-documents/acir-exports/detail-reads/ that the schema could not
// hold before.

describe("global scope", () => {
  it("evaluates a global rule instead of sending it to manual review", () => {
    // "Dried Cocoa Leaves from All Countries" is neither a country nor a
    // region. Unlike "South America", it needs no mapping to be tested — it
    // covers every origin by definition.
    const global = rule({ id: "global", origin_country: null, origin_region: null });
    const r = resolveRule([global], query({ originCountry: "EC" }));
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.rule.id).toBe("global");
  });

  it("prefers a country rule over the global rule behind it", () => {
    // How an enumerated prohibition is held: one global "no market access",
    // plus a country row for each state that has it. Granting access is one
    // insert, not an edit to a list of 190.
    const globalBan = rule({
      id: "ban", origin_country: null, origin_region: null, admissibility: "prohibited",
    });
    const mexico = rule({ id: "mexico", origin_country: "MX", admissibility: "restricted" });
    const r = resolveRule([globalBan, mexico], query({ originCountry: "MX" }));
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.rule.admissibility).toBe("restricted");
  });

  it("falls through to the global prohibition for an origin nobody entered", () => {
    // The safe direction to fail in: an unlisted country gets the ban, not
    // silence.
    const globalBan = rule({
      id: "ban", origin_country: null, origin_region: null, admissibility: "prohibited",
    });
    const mexico = rule({ id: "mexico", origin_country: "MX", admissibility: "restricted" });
    const r = resolveRule([globalBan, mexico], query({ originCountry: "GH" }));
    expect(r.status).toBe("resolved");
    if (r.status === "resolved") expect(r.rule.admissibility).toBe("prohibited");
  });

  it("still lets an unevaluable region rule block a global one", () => {
    const region = rule({
      id: "region", origin_country: null, origin_region: "South America",
      admissibility: "prohibited",
    });
    const global = rule({ id: "global", origin_country: null, origin_region: null });
    expect(resolveRule([region, global], query({ originCountry: "PE" })).status)
      .toBe("manual_review");
  });
});

describe("not_for_propagation", () => {
  it("covers consumption, processing and research", () => {
    const r = rule({ intended_use: "not_for_propagation" });
    for (const use of ["consumption", "processing", "research"] as const) {
      expect(resolveRule([r], query({ intendedUse: use })).status).toBe("resolved");
    }
  });

  it("does not cover propagation", () => {
    // The failure this value exists to prevent: entered as `any`, a rule
    // permitting cacao pods would have appeared to permit importing them to
    // plant.
    const r = rule({ intended_use: "not_for_propagation", admissibility: "permitted" });
    expect(resolveRule([r], query({ intendedUse: "propagation" })).status).toBe("no_rule");
  });

  it("ranks between an exact use and any use", () => {
    const exact = rule({ intended_use: "consumption" });
    const notForProp = rule({ intended_use: "not_for_propagation" });
    const anyUse = rule({ intended_use: "any" });
    expect(specificity(exact)).toBeGreaterThan(specificity(notForProp));
    expect(specificity(notForProp)).toBeGreaterThan(specificity(anyUse));
  });

  it("still ranks a country rule above any use", () => {
    const country = rule({ origin_country: "MX", intended_use: "any" });
    const globalExact = rule({
      origin_country: null, origin_region: null,
      intended_use: "consumption", processing_state: "fresh",
    });
    expect(specificity(country)).toBeGreaterThan(specificity(globalExact));
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
    // Every flag explicitly false — a source that was read and said no.
    expect(conditionsOf(rule())).toEqual([]);
  });

  it("says so when the source never mentioned a requirement", () => {
    // The Mexico cacao document says nothing about phyto. Before 026 that was
    // stored as false and read back as "no phytosanitary certificate
    // required", which nobody had checked.
    const conditions = conditionsOf(rule({ phyto_required: null }));
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toContain("does not state");
    expect(conditions[0]).toContain("phytosanitary");
  });

  it("does not let silence read as a negative", () => {
    // The distinction that matters: "Dried Cocoa Leaves" states "No permit is
    // required", which is a checked negative and stays silent in the output.
    // A null must not produce the same empty list.
    const checkedNo = conditionsOf(rule({ permit_required: false }));
    const unstated = conditionsOf(rule({ permit_required: null }));
    expect(checkedNo).toEqual([]);
    expect(unstated).not.toEqual([]);
  });

  it("raises every unanswered question at once", () => {
    const conditions = conditionsOf(rule({
      permit_required: null,
      phyto_required: null,
      treatment_required: null,
      peq_required: null,
    }));
    expect(conditions).toHaveLength(4);
  });
});
