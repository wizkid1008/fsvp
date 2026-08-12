import { describe, expect, it } from "vitest";
import { evaluateAdmissibility } from "./gate";

type Fixture = { data?: unknown[]; error?: { message: string } | null };

function fakeDb(fixture: Fixture) {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => Promise.resolve({ data: fixture.data ?? [], error: fixture.error ?? null }),
  };
  return { from: () => query };
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

  it("requires a determination", async () => {
    const blocks = await evaluateAdmissibility(fakeDb({ data: [] }) as any, context);
    expect(blocks.map((block) => block.code)).toEqual(["determination_missing"]);
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
