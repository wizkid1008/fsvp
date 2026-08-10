import { describe, expect, it } from "vitest";
import {
  actionEventType,
  credentialsFromEnv,
  datasetFor,
  DataDashboardError,
  fetchDataset,
  normaliseComplianceAction,
  normaliseInspection,
  normaliseRefusal,
  DATASETS,
} from "./datadashboard";
import { toIsoDate, shorten } from "./events";

const CREDS = { user: "someone@example.com", key: "test-key" };

/** A fake fetch that records what it was called with and replays scripted pages. */
function fakeFetch(pages: unknown[][], status = 200) {
  const calls: Array<{ url: string; init: any }> = [];
  let page = 0;

  const impl = (async (url: string, init: any) => {
    calls.push({ url, init });
    const body = pages[page++] ?? [];
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ statuscode: 200, resultcount: body.length, result: body }),
    };
  }) as unknown as typeof fetch;

  return { impl, calls };
}

describe("credentialsFromEnv", () => {
  it("requires both halves", () => {
    // A half-configured credential 401s at request time, and an unhandled 401
    // looks exactly like a supplier having no findings.
    expect(credentialsFromEnv({ FDA_DATADASHBOARD_USER: "a@b.com" } as any)).toBeNull();
    expect(credentialsFromEnv({ FDA_DATADASHBOARD_KEY: "k" } as any)).toBeNull();
    expect(credentialsFromEnv({} as any)).toBeNull();
  });

  it("returns both when set, trimmed", () => {
    const c = credentialsFromEnv({
      FDA_DATADASHBOARD_USER: " a@b.com ",
      FDA_DATADASHBOARD_KEY: " k ",
    } as any);
    expect(c).toEqual({ user: "a@b.com", key: "k" });
  });

  it("treats whitespace-only values as absent", () => {
    expect(credentialsFromEnv({
      FDA_DATADASHBOARD_USER: "   ",
      FDA_DATADASHBOARD_KEY: "k",
    } as any)).toBeNull();
  });
});

describe("fetchDataset", () => {
  it("sends FDA's two auth headers and a 1-based start", async () => {
    const { impl, calls } = fakeFetch([[{ a: 1 }]]);
    await fetchDataset("import_refusals", CREDS, { sort: "RefusalDate" }, { fetchImpl: impl });

    expect(calls[0].url).toBe("https://api-datadashboard.fda.gov/v1/import_refusals");
    expect(calls[0].init.headers["Authorization-User"]).toBe("someone@example.com");
    expect(calls[0].init.headers["Authorization-Key"]).toBe("test-key");

    const body = JSON.parse(calls[0].init.body);
    // Off-by-one here silently drops the first record of every page.
    expect(body.start).toBe(1);
    expect(body.sort).toBe("RefusalDate");
    expect(body.sortorder).toBe("DESC");
  });

  it("stops once a short page comes back", async () => {
    const { impl, calls } = fakeFetch([[{ a: 1 }, { a: 2 }]]);
    const rows = await fetchDataset("compliance_actions", CREDS, { sort: "ActionTakenDate" }, {
      fetchImpl: impl,
      maxRecords: 5000,
    });
    expect(rows).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it("honours maxRecords even when a page returns more rows than asked for", async () => {
    // The page size is a request, not a guarantee. This loop is what stands
    // between a first-ever pull and an unbounded one, so it truncates rather
    // than trusting the server to respect `rows`.
    const full = Array.from({ length: 1000 }, (_, i) => ({ i }));
    const { impl } = fakeFetch([full, full, full]);
    const rows = await fetchDataset("import_refusals", CREDS, { sort: "RefusalDate" }, {
      fetchImpl: impl,
      maxRecords: 1500,
    });
    expect(rows).toHaveLength(1500);
  });

  it("explains a 401 in terms of the credentials, not the HTTP code", async () => {
    const { impl } = fakeFetch([[]], 401);
    await expect(
      fetchDataset("import_refusals", CREDS, { sort: "RefusalDate" }, { fetchImpl: impl })
    ).rejects.toThrow(/FDA_DATADASHBOARD_USER/);
  });

  it("treats a non-200 statuscode in a 200 body as a failure", async () => {
    // The API answers HTTP 200 with an error status inside the envelope. An
    // HTTP-only check would read a rejected query as an empty dataset — which
    // is the same shape as "this supplier is clean".
    const impl = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ statuscode: 400, message: "Invalid sort column", result: [] }),
    })) as unknown as typeof fetch;

    await expect(
      fetchDataset("import_refusals", CREDS, { sort: "Nope" }, { fetchImpl: impl })
    ).rejects.toThrow(DataDashboardError);
  });
});

describe("normaliseRefusal", () => {
  const row = {
    FEINumber: "3009876543",
    FirmName: "Grupo Agricola del Valle SA DE CV",
    AddressLine1: "Km 12 Carretera",
    City: "Culiacan",
    CountryName: "Mexico",
    ProductCode: "20AC01",
    ProductCodeDescription: "Fresh tomatoes",
    RefusalDate: "2026-03-14",
    RefusalCharges: "PESTICIDE — the article appears to contain a pesticide chemical",
    ShipmentID: "ABC1234567-001-01",
  };

  it("maps identity, date and product through", () => {
    const e = normaliseRefusal(row)!;
    expect(e.source).toBe("fda_import_refusals");
    expect(e.event_type).toBe("import_refusal");
    expect(e.firm_fei).toBe("3009876543");
    expect(e.firm_country).toBe("Mexico");
    expect(e.event_date).toBe("2026-03-14");
    expect(e.summary).toContain("Grupo Agricola del Valle");
    expect(e.summary).toContain("PESTICIDE");
  });

  it("composes the dedupe key from shipment and product", () => {
    // ShipmentID should identify a refused line alone. Appending the product
    // code means a wrong assumption produces a visible duplicate rather than
    // silently collapsing two distinct refusals and losing a finding.
    expect(normaliseRefusal(row)!.source_ref).toBe("ABC1234567-001-01:20AC01");
  });

  it("drops a row with no identifier at all rather than inventing one", () => {
    expect(normaliseRefusal({ FirmName: "Nameless" })).toBeNull();
  });

  it("leaves classification null rather than inventing a severity", () => {
    // Refusals carry no FDA grade; findingSeverity treats an ungraded refusal
    // as a warning, which is the honest default.
    expect(normaliseRefusal(row)!.classification).toBeNull();
  });

  it("falls back to the country code when no name is given", () => {
    const e = normaliseRefusal({ ...row, CountryName: undefined, CountryCode: "MX" })!;
    expect(e.firm_country).toBe("MX");
  });
});

describe("normaliseInspection", () => {
  const row = {
    FEINumber: "3001111111",
    LegalName: "Pacific Seafood Exports Ltd",
    CountryName: "Vietnam",
    InspectionID: "INSP-99887",
    InspectionEndDate: "2026-02-02",
    Classification: "OAI",
    ClassificationCode: "OAI",
    ProductType: "Food/Cosmetics",
  };

  it("uses InspectionID as the dedupe key and keeps the grade", () => {
    const e = normaliseInspection(row)!;
    expect(e.source_ref).toBe("INSP-99887");
    expect(e.classification).toBe("OAI");
    expect(e.event_type).toBe("inspection_classification");
  });

  it("spells out what the code means, since NAI/VAI/OAI are not self-explanatory", () => {
    expect(normaliseInspection(row)!.summary).toContain("official action indicated");
    expect(normaliseInspection({ ...row, ClassificationCode: "NAI" })!.summary)
      .toContain("no action indicated");
  });

  it("drops a row with no InspectionID", () => {
    expect(normaliseInspection({ LegalName: "Someone" })).toBeNull();
  });
});

describe("normaliseComplianceAction", () => {
  it("maps FDA's action strings onto our event vocabulary", () => {
    expect(actionEventType("Warning Letter")).toBe("warning_letter");
    expect(actionEventType("warning letter")).toBe("warning_letter");
    expect(actionEventType("Seizure")).toBe("seizure");
    expect(actionEventType("Injunction")).toBe("injunction");
    expect(actionEventType("Something New")).toBe("other_action");
    expect(actionEventType(undefined)).toBe("other_action");
  });

  it("uses CaseInjunctionID as the dedupe key", () => {
    const e = normaliseComplianceAction({
      CaseInjunctionID: "CASE-4242",
      LegalName: "Northern Grain Traders",
      ActionType: "Warning Letter",
      ActionTakenDate: "2026-01-09",
      CountryName: "Kenya",
    })!;
    expect(e.source_ref).toBe("CASE-4242");
    expect(e.event_type).toBe("warning_letter");
    expect(e.event_date).toBe("2026-01-09");
    expect(e.summary).toBe("Northern Grain Traders: Warning Letter");
  });

  it("drops a row with no case id", () => {
    expect(normaliseComplianceAction({ LegalName: "Someone" })).toBeNull();
  });
});

describe("DATASETS", () => {
  it("covers exactly the three credentialed sources", () => {
    expect(DATASETS.map((d) => d.source).sort()).toEqual([
      "fda_compliance_actions",
      "fda_import_refusals",
      "fda_inspections_classifications",
    ]);
  });

  it("narrows the two datasets that span every FDA centre to food", () => {
    // Without this a food importer's queue fills with medical device findings.
    expect(datasetFor("fda_inspections_classifications")!.baseFilters.ProductType)
      .toEqual(["Food/Cosmetics"]);
    expect(datasetFor("fda_compliance_actions")!.baseFilters.ProductType)
      .toEqual(["Food/Cosmetics"]);
  });

  it("leaves refusals unfiltered, because that dataset has no ProductType column", () => {
    expect(datasetFor("fda_import_refusals")!.baseFilters).toEqual({});
  });

  it("gives every dataset a sort column, which the API requires", () => {
    for (const d of DATASETS) {
      expect(d.sort.length).toBeGreaterThan(0);
      expect(d.dateColumn.length).toBeGreaterThan(0);
    }
  });

  it("returns null for a source that is not a Data Dashboard dataset", () => {
    expect(datasetFor("fda_food_enforcement")).toBeNull();
  });
});

describe("toIsoDate", () => {
  it("accepts the formats FDA has been seen to emit", () => {
    expect(toIsoDate("20260314")).toBe("2026-03-14");
    expect(toIsoDate("2026-03-14")).toBe("2026-03-14");
    expect(toIsoDate("2026-03-14T00:00:00Z")).toBe("2026-03-14");
    expect(toIsoDate("3/14/2026")).toBe("2026-03-14");
  });

  it("returns null rather than guessing at nonsense", () => {
    expect(toIsoDate(undefined)).toBeNull();
    expect(toIsoDate("")).toBeNull();
    expect(toIsoDate("last Tuesday")).toBeNull();
  });
});

describe("shorten", () => {
  it("collapses whitespace and truncates with an ellipsis", () => {
    expect(shorten("  a   b  ")).toBe("a b");
    expect(shorten("x".repeat(300)).length).toBe(180);
    expect(shorten("x".repeat(300)).endsWith("…")).toBe(true);
  });

  it("returns an empty string for nothing", () => {
    expect(shorten(null)).toBe("");
    expect(shorten(undefined)).toBe("");
  });
});
