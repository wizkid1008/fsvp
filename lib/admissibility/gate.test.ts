import { describe, expect, it } from "vitest";
import { evaluateAdmissibility, hardAdmissibilityBlocks } from "./gate";

type Fixture = {
  data?: unknown[];
  error?: { message: string } | null;
  /** Live country-commodity rules for the product's commodity. Defaults to one. */
  ruleCount?: number;
  ruleError?: { message: string } | null;
};

function fakeDb(fixture: Fixture) {
  const chain = (result: unknown) => {
    const query: Record<string, unknown> = {};
    query.select = () => query;
    query.eq = () => query;
    query.is = () => Promise.resolve(result);
    return query;
  };
  return {
    from: (table: string) =>
      table === "country_commodity_rules"
        ? chain({ count: fixture.ruleCount ?? 1, error: fixture.ruleError ?? null })
        : chain({ data: fixture.data ?? [], error: fixture.error ?? null }),
  };
}

const context = {
  productId: "product-1",
  commodityId: "commodity-1",
  countryOfOrigin: "MX",
};

describe("evaluateAdmissibility", () => {
  it("fails before querying when classification inputs are missing", async () => {
    const blocks = await evaluateAdmissibility(fakeDb({}) as any, {
      ...context,
      commodityId: null,
      countryOfOrigin: null,
    });
    expect(blocks.map((block) => block.code)).toEqual(["not_classified", "no_origin"]);
  });

  it("fails closed when determination data cannot be read", async () => {
    const blocks = await evaluateAdmissibility(
      fakeDb({ error: { message: "view unavailable" } }) as any,
      context
    );
    expect(blocks.map((block) => block.code)).toEqual(["determination_unavailable"]);
  });

  it("requires a determination when a rule exists to determine against", async () => {
    const blocks = await evaluateAdmissibility(fakeDb({ data: [], ruleCount: 1 }) as any, context);
    expect(blocks.map((block) => block.code)).toEqual(["determination_missing"]);
  });

  // Same absence, different owner. The importer cannot resolve against a rule
  // that is not there, and the product page no longer offers them a button, so
  // naming their action would be naming one they cannot take.
  it("says the platform is the one being waited on when no rule is on file", async () => {
    const blocks = await evaluateAdmissibility(fakeDb({ data: [], ruleCount: 0 }) as any, context);
    expect(blocks.map((block) => block.code)).toEqual(["awaiting_reference_rule"]);
    expect(blocks[0].message).toContain("platform administrator");
    expect(blocks[0].message).toContain("does not stop the rest of the file");
  });

  it("does not reassign the work when the rule count cannot be read", async () => {
    // Guessing "wait for an administrator" on a failed read would park the
    // importer on somebody who has nothing to do. Asking them to try at least
    // surfaces a real error.
    const blocks = await evaluateAdmissibility(
      fakeDb({ data: [], ruleCount: 0, ruleError: { message: "unavailable" } }) as any,
      context
    );
    expect(blocks.map((block) => block.code)).toEqual(["determination_missing"]);
  });

  it("keeps both absences soft", async () => {
    const waiting = await evaluateAdmissibility(fakeDb({ data: [], ruleCount: 0 }) as any, context);
    const missing = await evaluateAdmissibility(fakeDb({ data: [], ruleCount: 1 }) as any, context);
    expect(hardAdmissibilityBlocks(waiting)).toEqual([]);
    expect(hardAdmissibilityBlocks(missing)).toEqual([]);
  });

  it("returns every blocking determination condition", async () => {
    const blocks = await evaluateAdmissibility(fakeDb({ data: [
      {
        id: "prohibited",
        outcome: "prohibited",
        expires_at: "2027-01-01",
        is_current: true,
        rule_superseded: false,
        citation: "7 CFR 319",
        intended_use: "consumption",
        processing_state: "fresh",
      },
      {
        id: "expired",
        outcome: "restricted",
        expires_at: "2025-01-01",
        is_current: false,
        rule_superseded: false,
        citation: "ACIR",
        intended_use: "processing",
        processing_state: "frozen",
      },
      {
        id: "superseded",
        outcome: "permitted",
        expires_at: "2027-01-01",
        is_current: true,
        rule_superseded: true,
        citation: "ACIR",
        intended_use: "research",
        processing_state: "other",
      },
    ] }) as any, context);

    expect(blocks.map((block) => block.code)).toEqual([
      "prohibited",
      "determination_expired",
      "rule_superseded",
    ]);
  });

  it("allows current permitted and restricted determinations", async () => {
    const blocks = await evaluateAdmissibility(fakeDb({ data: [
      {
        id: "restricted",
        outcome: "restricted",
        expires_at: "2027-01-01",
        is_current: true,
        rule_superseded: false,
        citation: "ACIR",
        intended_use: "consumption",
        processing_state: "fresh",
      },
    ] }) as any, context);
    expect(blocks).toEqual([]);
  });
});
