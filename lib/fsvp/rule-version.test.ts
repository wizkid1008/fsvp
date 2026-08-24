import { describe, expect, it } from "vitest";
import { fetchGoverningRuleVersion, ruleVersionBlock } from "./rule-version";

/**
 * Minimal stand-in for the PostgREST builder, in the same spirit as the one in
 * gates.test.ts: every filter is chainable, the list query resolves at
 * order() and the single-row query at maybeSingle().
 *
 * The filters are recorded so the tests can assert that the applies_to scope
 * was actually sent to the database — the whole point of this module is a
 * filter that used to be missing, and a stub that silently ignored it would
 * pass either way.
 */
function fakeDb(data: unknown) {
  const filters: Array<[string, unknown, unknown]> = [];
  const chain: any = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      filters.push(["eq", column, value]);
      return chain;
    },
    in: (column: string, values: unknown) => {
      filters.push(["in", column, values]);
      return chain;
    },
    order: () => Promise.resolve({ data }),
    maybeSingle: () => Promise.resolve({ data }),
  };
  return { db: { from: () => chain }, filters };
}

const version = (id: string, ruleSetId: string, versionNumber: number) => ({
  id,
  rule_set_id: ruleSetId,
  version_number: versionNumber,
});

describe("fetchGoverningRuleVersion", () => {
  it("scopes the query to rule sets that can govern an FSVP record", async () => {
    const { db, filters } = fakeDb([version("v1", "set-a", 1)]);
    await fetchGoverningRuleVersion(db);

    expect(filters).toContainEqual(["eq", "status", "published"]);
    expect(filters).toContainEqual(["in", "rule_sets.applies_to", ["fsvp_record", "all"]]);
  });

  it("returns the highest published version of the governing set", async () => {
    // Ordered by version_number desc, as the query asks for.
    const { db } = fakeDb([version("v3", "set-a", 3), version("v1", "set-a", 1)]);
    const result = await fetchGoverningRuleVersion(db);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.version.id).toBe("v3");
      expect(result.version.versionNumber).toBe(3);
    }
  });

  it("refuses when two published sets both claim FSVP records", async () => {
    // The old code picked by version_number here, so publishing v2 of an
    // unrelated set silently took over. There is no basis for preferring
    // either, so neither is chosen.
    const { db } = fakeDb([version("v2", "set-b", 2), version("v1", "set-a", 1)]);
    const result = await fetchGoverningRuleVersion(db);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/more than one published rule set/i);
  });

  it("reports when nothing is published rather than throwing", async () => {
    const { db } = fakeDb([]);
    const result = await fetchGoverningRuleVersion(db);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no published rule set/i);
  });

  it("treats a null response as nothing published", async () => {
    const { db } = fakeDb(null);
    const result = await fetchGoverningRuleVersion(db);

    expect(result.ok).toBe(false);
  });
});

describe("ruleVersionBlock", () => {
  it("accepts a published version scoped to fsvp_record", async () => {
    const { db } = fakeDb({ status: "published", rule_sets: { applies_to: "fsvp_record" } });
    expect(await ruleVersionBlock(db, "v1")).toBeNull();
  });

  it("accepts a published version scoped to all", async () => {
    const { db } = fakeDb({ status: "published", rule_sets: { applies_to: "all" } });
    expect(await ruleVersionBlock(db, "v1")).toBeNull();
  });

  it("rejects a version whose set is scoped to facilities", async () => {
    // Previously accepted: the old check read status and nothing else.
    const { db } = fakeDb({ status: "published", rule_sets: { applies_to: "facility" } });
    const block = await ruleVersionBlock(db, "v1");

    expect(block).toMatch(/cannot govern an FSVP record/i);
    expect(block).toContain("facility");
  });

  it("rejects a version scoped to products", async () => {
    const { db } = fakeDb({ status: "published", rule_sets: { applies_to: "product" } });
    expect(await ruleVersionBlock(db, "v1")).toMatch(/cannot govern an FSVP record/i);
  });

  it("rejects a draft version", async () => {
    const { db } = fakeDb({ status: "draft", rule_sets: { applies_to: "all" } });
    expect(await ruleVersionBlock(db, "v1")).toMatch(/published/i);
  });

  it("rejects an archived version", async () => {
    const { db } = fakeDb({ status: "archived", rule_sets: { applies_to: "all" } });
    expect(await ruleVersionBlock(db, "v1")).toMatch(/published/i);
  });

  it("rejects a version that does not exist", async () => {
    const { db } = fakeDb(null);
    expect(await ruleVersionBlock(db, "nope")).toMatch(/does not exist/i);
  });
});
