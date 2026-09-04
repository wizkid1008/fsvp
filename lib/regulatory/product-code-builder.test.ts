import { describe, expect, it } from "vitest";
import {
  decomposeProductCode,
  listIndustries,
  listPicsForIndustry,
  listSubclassesForIndustry,
  PcbError,
  pcbCredentialsFromEnv,
  reconcileWithCommodity,
  searchPartialCodes,
  searchProductsByName,
  verifyProductCode,
  zipColumns,
} from "./product-code-builder";

const CREDS = { user: "someone@example.com", key: "test-key" };

/** A fake fetch that records calls and replays one scripted response. */
function fakeFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: any }> = [];

  const impl = (async (url: string, init: any) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  }) as unknown as typeof fetch;

  return { impl, calls };
}

const TABLE = {
  MESSAGE: "Success.",
  APIRETURNCODE: 200,
  RESULT: {
    COLUMNS: ["INDUSTRY_ID", "INDUSTRY_NAME"],
    DATA: [
      ["38", "Soup"],
      ["16", "Fishery/Seafood Prod"],
    ],
  },
};

describe("pcbCredentialsFromEnv", () => {
  it("requires both halves", () => {
    expect(pcbCredentialsFromEnv({ FDA_PCB_USER: "a@b.com" } as any)).toBeNull();
    expect(pcbCredentialsFromEnv({ FDA_PCB_KEY: "k" } as any)).toBeNull();
    expect(pcbCredentialsFromEnv({} as any)).toBeNull();
  });

  it("trims, and treats whitespace-only as absent", () => {
    expect(pcbCredentialsFromEnv({ FDA_PCB_USER: " a@b.com ", FDA_PCB_KEY: " k " } as any))
      .toEqual({ user: "a@b.com", key: "k" });
    expect(pcbCredentialsFromEnv({ FDA_PCB_USER: "   ", FDA_PCB_KEY: "k" } as any)).toBeNull();
  });
});

describe("zipColumns", () => {
  it("zips by column NAME, not position", () => {
    // Column order is not guaranteed between releases; reading positionally
    // would silently swap two fields the day FDA reorders them.
    const rows = zipColumns({ COLUMNS: ["B", "A"], DATA: [["b1", "a1"]] });
    expect(rows).toEqual([{ B: "b1", A: "a1" }]);
  });

  it("fills short rows with null rather than undefined", () => {
    expect(zipColumns({ COLUMNS: ["A", "B"], DATA: [["a"]] })).toEqual([{ A: "a", B: null }]);
  });

  it("survives a missing or malformed result", () => {
    expect(zipColumns(null)).toEqual([]);
    expect(zipColumns({})).toEqual([]);
    expect(zipColumns({ COLUMNS: ["A"] })).toEqual([]);
  });
});

describe("table requests", () => {
  it("sends both auth headers, a User-Agent, and a signature", async () => {
    const { impl, calls } = fakeFetch(TABLE);
    await listIndustries(CREDS, { fetchImpl: impl });

    expect(calls[0].init.headers["Authorization-User"]).toBe("someone@example.com");
    expect(calls[0].init.headers["Authorization-Key"]).toBe("test-key");
    expect(calls[0].init.headers["User-Agent"]).toContain("FSVP");
    expect(calls[0].url).toMatch(
      /^https:\/\/www\.accessdata\.fda\.gov\/rest\/pcbapi\/v1\/industry\?signature=/
    );
  });

  it("gives every request a different signature", async () => {
    // Responses are cached by URL. A repeated signature replays the previous
    // answer — including a 401 from a key that has since been fixed.
    const { impl, calls } = fakeFetch(TABLE);
    await listIndustries(CREDS, { fetchImpl: impl });
    await listIndustries(CREDS, { fetchImpl: impl });
    expect(calls[0].url).not.toBe(calls[1].url);
  });

  it("treats HTTP 400 carrying a RESULT as success", async () => {
    // FDA's spec defines 400 as "Success" on every endpoint. Judging by status
    // would discard a full, valid reference table.
    const { impl } = fakeFetch({ ...TABLE, APIRETURNCODE: 400 }, 400);
    const rows = await listIndustries(CREDS, { fetchImpl: impl });
    expect(rows).toEqual([
      { INDUSTRY_ID: "38", INDUSTRY_NAME: "Soup" },
      { INDUSTRY_ID: "16", INDUSTRY_NAME: "Fishery/Seafood Prod" },
    ]);
  });

  it("throws rather than returning an empty table when the key is rejected", async () => {
    // An empty reference table and a rejected credential look identical
    // downstream, and only one of them should stop an ingest.
    const { impl } = fakeFetch({ MESSAGE: "denied", APIRETURNCODE: 410 }, 410);
    await expect(listIndustries(CREDS, { fetchImpl: impl })).rejects.toThrow(/FDA_PCB_KEY/);
  });

  it("names the user, not the key, on a 411", async () => {
    const { impl } = fakeFetch({ APIRETURNCODE: 411 }, 200);
    await expect(listIndustries(CREDS, { fetchImpl: impl })).rejects.toThrow(/FDA_PCB_USER/);
  });

  it("reports a missing result set instead of inventing an empty one", async () => {
    const { impl } = fakeFetch({ MESSAGE: "nope", APIRETURNCODE: 500 }, 200);
    await expect(listIndustries(CREDS, { fetchImpl: impl })).rejects.toBeInstanceOf(PcbError);
  });
});

describe("verifyProductCode", () => {
  // The whole point of this block: 403 and 404 do NOT mean what they usually
  // mean on this endpoint. Reading them conventionally inverts the answer.
  it("reads 403 as a VALID code", async () => {
    const { impl } = fakeFetch({ MESSAGE: "Valid product code", APIRETURNCODE: 403 }, 403);
    await expect(verifyProductCode("38BEE27", CREDS, { fetchImpl: impl })).resolves.toMatchObject({
      status: "valid",
      code: "38BEE27",
    });
  });

  it("reads 404 as an INVALID code, not a missing route", async () => {
    const { impl } = fakeFetch({ MESSAGE: "Invalid product code", APIRETURNCODE: 404 }, 404);
    await expect(verifyProductCode("99ZZZ99", CREDS, { fetchImpl: impl })).resolves.toMatchObject({
      status: "invalid",
    });
  });

  it("reads 402 as a length problem", async () => {
    const { impl } = fakeFetch({ APIRETURNCODE: 402 }, 402);
    await expect(verifyProductCode("38B", CREDS, { fetchImpl: impl })).resolves.toMatchObject({
      status: "bad_length",
    });
  });

  it("keeps a credential failure distinct from a bad code", async () => {
    // Telling an importer their broker's code is bogus when in fact our key
    // expired is the specific wrong answer this guards.
    const { impl } = fakeFetch({ APIRETURNCODE: 401 }, 401);
    await expect(verifyProductCode("38BEE27", CREDS, { fetchImpl: impl }))
      .rejects.toThrow(/Authorization/);
  });

  it("refuses to guess when FDA answers with something unrecognised", async () => {
    const { impl } = fakeFetch({ MESSAGE: "???", APIRETURNCODE: 200 }, 200);
    await expect(verifyProductCode("38BEE27", CREDS, { fetchImpl: impl })).rejects.toThrow(/did not say/);
  });

  it("uppercases and trims before asking", async () => {
    const { impl, calls } = fakeFetch({ APIRETURNCODE: 403 }, 403);
    await verifyProductCode("  38bee27 ", CREDS, { fetchImpl: impl });
    expect(calls[0].url).toContain("/productcode/38BEE27");
  });
});

describe("searchProductsByName", () => {
  it("uses the GET form for an ordinary name", async () => {
    const { impl, calls } = fakeFetch(TABLE);
    await searchProductsByName("vanilla bean", CREDS, { fetchImpl: impl });
    expect(calls[0].init.method).toBe("GET");
    expect(calls[0].url).toContain("/product/name/vanilla%20bean");
  });

  it("switches to POST when the name contains %, & or /", async () => {
    // "Lamb (3% or less)" is a real FDA product name, and the percent sign
    // breaks the path-parameter form.
    const { impl, calls } = fakeFetch(TABLE);
    await searchProductsByName("Lamb (3% or less)", CREDS, { fetchImpl: impl });
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(calls[0].init.body).toBe("payload=Lamb+%283%25+or+less%29");
  });

  it("does not call FDA for an empty search", async () => {
    const { impl, calls } = fakeFetch(TABLE);
    expect(await searchProductsByName("   ", CREDS, { fetchImpl: impl })).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe("searchPartialCodes", () => {
  it("always sends industry, and keeps the signature separate", async () => {
    const { impl, calls } = fakeFetch(TABLE);
    await searchPartialCodes({ industry: 38, class: "B" }, CREDS, { fetchImpl: impl });
    expect(calls[0].url).toContain("industry=38");
    expect(calls[0].url).toContain("class=B");
    expect(calls[0].url).toContain("&signature=");
  });
});

describe("decomposeProductCode", () => {
  it("splits FDA's own worked example", () => {
    // 38BEE27 — canned concentrated tomato soup. Subclass E is the METAL can,
    // PIC E is the commercially sterile retort: both properties of the goods as
    // packed, not of the commodity.
    expect(decomposeProductCode("38BEE27")).toEqual({
      status: "parsed",
      parts: { industry: "38", class: "B", subclass: "E", pic: "E", product: "27" },
    });
  });

  it("reads hyphens as absent elements", () => {
    expect(decomposeProductCode("79L--RR")).toEqual({
      status: "parsed",
      parts: { industry: "79", class: "L", subclass: null, pic: null, product: "RR" },
    });
  });

  it("handles a five-character code with no middle at all", () => {
    expect(decomposeProductCode("16ABC")).toEqual({
      status: "parsed",
      parts: { industry: "16", class: "A", subclass: null, pic: null, product: "BC" },
    });
  });

  it("refuses to guess which element a six-character code carries", () => {
    // Filing a container code as a process code would be silent and wrong.
    const result = decomposeProductCode("38BE27");
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") throw new Error("expected ambiguous");
    expect(result.candidates).toEqual([
      { industry: "38", class: "B", subclass: "E", pic: null, product: "27" },
      { industry: "38", class: "B", subclass: null, pic: "E", product: "27" },
    ]);
  });

  it("normalises case and whitespace", () => {
    expect(decomposeProductCode("  38bee27  ")).toMatchObject({ status: "parsed" });
  });

  it("rejects codes that cannot be a product code", () => {
    expect(decomposeProductCode("38BE").status).toBe("unparseable");
    expect(decomposeProductCode("38BEE271").status).toBe("unparseable");
    expect(decomposeProductCode("AABEE27").status).toBe("unparseable");
    expect(decomposeProductCode("384EE27").status).toBe("unparseable");
    expect(decomposeProductCode("38BE*27").status).toBe("unparseable");
  });
});

describe("reconcileWithCommodity", () => {
  const soup = { industry: "38", class: "B", group: "27" };
  const parts = { industry: "38", class: "B", subclass: "E", pic: "E", product: "27" };

  it("is silent when the code and the commodity agree", () => {
    expect(reconcileWithCommodity(parts, soup)).toEqual([]);
  });

  it("treats missing commodity values as nothing to disagree with", () => {
    // Neither side has asserted anything, so there is no conflict. Warning here
    // would push people to fill fields with guesses to silence it.
    expect(reconcileWithCommodity(parts, {})).toEqual([]);
    expect(reconcileWithCommodity(parts, { industry: null, class: null, group: null })).toEqual([]);
  });

  it("ignores subclass and PIC entirely", () => {
    // They describe the container and the process, so a commodity has no
    // opinion about them and cannot disagree.
    const glass = { ...parts, subclass: "A", pic: "C" };
    expect(reconcileWithCommodity(glass, soup)).toEqual([]);
  });

  it("reports every disagreement, not just the first", () => {
    const mismatches = reconcileWithCommodity(parts, { industry: "16", class: "C", group: "99" });
    expect(mismatches).toHaveLength(3);
    expect(mismatches[0]).toContain("industry");
  });

  it("compares case- and whitespace-insensitively", () => {
    expect(reconcileWithCommodity(parts, { industry: " 38 ", class: "b", group: "27" })).toEqual([]);
  });
});

describe("industry-scoped endpoints", () => {
  it("sends FDA's zero-padded industry id verbatim", async () => {
    // FDA's own /industry response gives INDID as "02". Number("02") is 2, and
    // /industrysubclass/2 is a request for an industry that does not exist --
    // which is why both dropdowns were empty and the scoped endpoints were
    // written off as unreliable.
    const { impl, calls } = fakeFetch(TABLE);
    await listSubclassesForIndustry("02", CREDS, { fetchImpl: impl });
    expect(calls[0].url).toContain("/industrysubclass/02");
    expect(calls[0].url).not.toContain("/industrysubclass/2?");
  });

  it("still accepts a number, for a caller that legitimately holds one", () => {
    const { impl, calls } = fakeFetch(TABLE);
    return listPicsForIndustry(38, CREDS, { fetchImpl: impl }).then(() => {
      expect(calls[0].url).toContain("/industrypic/38");
    });
  });

  it("carries the padded id through partial-code search too", async () => {
    const { impl, calls } = fakeFetch(TABLE);
    await searchPartialCodes({ industry: "02", class: "B" }, CREDS, { fetchImpl: impl });
    expect(calls[0].url).toContain("industry=02");
  });
});
