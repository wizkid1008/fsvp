import { describe, expect, it } from "vitest";
import {
  FUZZY_FLOOR,
  countryMatches,
  nameSimilarity,
  normaliseFirmName,
  proposeMatch,
  proposeMatches,
  type CountryLookup,
  type MatchableEntity,
} from "./matching";

// Stands in for the countries reference table.
const COUNTRIES: Record<string, string> = {
  MX: "Mexico",
  US: "United States",
  VN: "Vietnam",
  KE: "Kenya",
  ES: "Spain",
  BA: "Bosnia & Herzegovina",
  TR: "Turkey",
};

const lookup: CountryLookup = {
  nameForCode: (code) => COUNTRIES[code] ?? null,
};

function supplier(over: Partial<MatchableEntity> = {}): MatchableEntity {
  return { id: "s1", name: "Grupo Agricola del Valle", countryCode: "MX", ...over };
}

describe("normaliseFirmName", () => {
  it("reduces the same firm written two ways to one string", () => {
    expect(normaliseFirmName("Grupo Agrícola del Valle, S.A. de C.V."))
      .toBe(normaliseFirmName("GRUPO AGRICOLA DEL VALLE SA DE CV"));
  });

  it("strips corporate form only in trailing position", () => {
    expect(normaliseFirmName("Sunrise Foods Ltd")).toBe("SUNRISE FOODS");
    // "Corporation" here is part of the name, not the legal form.
    expect(normaliseFirmName("Corporation Street Bakery")).toBe("CORPORATION STREET BAKERY");
  });

  it("strips stacked suffixes", () => {
    expect(normaliseFirmName("Nam Viet Co Ltd")).toBe("NAM VIET");
  });

  it("keeps a name that is nothing but a corporate form", () => {
    // Must not normalise to "" — an empty string would match everything.
    expect(normaliseFirmName("Limited")).not.toBe("");
  });

  it("handles empty and missing input", () => {
    expect(normaliseFirmName(null)).toBe("");
    expect(normaliseFirmName(undefined)).toBe("");
    expect(normaliseFirmName("   ")).toBe("");
    expect(normaliseFirmName("!!!")).toBe("");
  });

  it("treats an ampersand and 'and' as the same", () => {
    expect(normaliseFirmName("Smith & Sons")).toBe(normaliseFirmName("Smith and Sons"));
  });
});

describe("nameSimilarity", () => {
  it("is 1 for identical strings and 0 when either side is empty", () => {
    expect(nameSimilarity("ACME FOODS", "ACME FOODS")).toBe(1);
    expect(nameSimilarity("", "ACME FOODS")).toBe(0);
  });

  it("rates a typo of a long name above the fuzzy floor", () => {
    expect(nameSimilarity("PACIFIC SEAFOOD EXPORTS", "PACIFC SEAFOOD EXPORTS"))
      .toBeGreaterThan(FUZZY_FLOOR);
  });

  it("rates two different firms below the fuzzy floor", () => {
    expect(nameSimilarity("PACIFIC SEAFOOD EXPORTS", "ATLANTIC POULTRY IMPORTS"))
      .toBeLessThan(FUZZY_FLOOR);
  });
});

describe("countryMatches", () => {
  it("matches our code against FDA's country name", () => {
    expect(countryMatches("MX", "Mexico", lookup)).toBe(true);
    expect(countryMatches("mx", "MEXICO", lookup)).toBe(true);
  });

  it("matches when the source sends a code instead of a name", () => {
    expect(countryMatches("MX", "MX", lookup)).toBe(true);
  });

  it("reconciles '&' against 'and' between the two vocabularies", () => {
    expect(countryMatches("BA", "Bosnia and Herzegovina", lookup)).toBe(true);
  });

  it("rejects a different country and refuses to guess on missing data", () => {
    expect(countryMatches("MX", "Vietnam", lookup)).toBe(false);
    expect(countryMatches(null, "Mexico", lookup)).toBe(false);
    expect(countryMatches("MX", null, lookup)).toBe(false);
    expect(countryMatches("ZZ", "Mexico", lookup)).toBe(false);
  });
});

describe("proposeMatch — what it refuses to propose", () => {
  it("does not match same-named firms in different countries", () => {
    // The case the country gate exists for: Sun Foods Ltd (Kenya) is not
    // Sun Foods Inc (Vietnam), and conflating them would put a Vietnamese
    // recall on a Kenyan supplier's record.
    const kenyan = supplier({ name: "Sun Foods Ltd", countryCode: "KE" });
    expect(
      proposeMatch(kenyan, { firmName: "Sun Foods Inc", firmCountry: "Vietnam", firmFei: null }, lookup)
    ).toBeNull();
  });

  it("does not fuzzy-match short names", () => {
    // "SUN" and "SAN" are 67% similar as strings and unrelated as firms. Short
    // names carry too little signal for a resemblance to mean anything, so they
    // must match exactly or not at all.
    const short = supplier({ name: "Sun Co", countryCode: "MX" });
    expect(
      proposeMatch(short, { firmName: "San Co", firmCountry: "Mexico", firmFei: null }, lookup)
    ).toBeNull();
  });

  it("still matches short names when they are exactly equal", () => {
    // The length floor guards the fuzzy path only. "Sun Co" and "Sun Ltd" both
    // reduce to "SUN" in the same country, which is worth a reviewer's glance
    // even though it is only a trading name.
    const short = supplier({ name: "Sun Co", countryCode: "MX" });
    const match = proposeMatch(
      short, { firmName: "Sun Ltd", firmCountry: "Mexico", firmFei: null }, lookup
    );
    expect(match?.method).toBe("name_country_exact");
  });

  it("does not propose anything below the similarity floor", () => {
    expect(
      proposeMatch(
        supplier({ name: "Pacific Seafood Exports" }),
        { firmName: "Atlantic Poultry Imports", firmCountry: "Mexico", firmFei: null },
        lookup
      )
    ).toBeNull();
  });

  it("proposes nothing when either name is missing", () => {
    expect(
      proposeMatch(supplier(), { firmName: null, firmCountry: "Mexico", firmFei: null }, lookup)
    ).toBeNull();
    expect(
      proposeMatch(supplier({ name: "" }), { firmName: "Anything", firmCountry: "Mexico", firmFei: null }, lookup)
    ).toBeNull();
  });

  it("proposes nothing when the country is unknown on either side", () => {
    expect(
      proposeMatch(
        supplier({ countryCode: null }),
        { firmName: "Grupo Agricola del Valle", firmCountry: "Mexico", firmFei: null },
        lookup
      )
    ).toBeNull();
  });
});

describe("proposeMatch — what it does propose", () => {
  it("treats an FEI match as exact, without needing the country", () => {
    const withFei = supplier({ feiNumber: "3009876543", countryCode: null });
    const match = proposeMatch(
      withFei,
      { firmName: "Totally Different Name", firmCountry: null, firmFei: "3009876543" },
      lookup
    );
    expect(match?.method).toBe("fei_exact");
    expect(match?.confidence).toBe(1);
    expect(match?.rationale).toContain("3009876543");
  });

  it("matches across corporate form and accents in the same country", () => {
    const match = proposeMatch(
      supplier({ name: "Grupo Agrícola del Valle, S.A. de C.V." }),
      { firmName: "GRUPO AGRICOLA DEL VALLE SA DE CV", firmCountry: "Mexico", firmFei: null },
      lookup
    );
    expect(match?.method).toBe("name_country_exact");
    expect(match?.confidence).toBe(0.9);
  });

  it("proposes a typo as fuzzy, never as exact", () => {
    const match = proposeMatch(
      supplier({ name: "Pacific Seafood Exports", countryCode: "VN" }),
      { firmName: "Pacifc Seafood Exports", firmCountry: "Vietnam", firmFei: null },
      lookup
    );
    expect(match?.method).toBe("name_country_fuzzy");
    expect(match!.confidence).toBeLessThan(0.9);
    expect(match!.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("never lets a name-based match claim certainty", () => {
    const match = proposeMatch(
      supplier(),
      { firmName: "Grupo Agricola del Valle", firmCountry: "Mexico", firmFei: null },
      lookup
    );
    // Only FEI equality earns 1.0. A name is not an identifier.
    expect(match!.confidence).toBeLessThan(1);
  });

  it("writes a rationale naming both strings, so a reviewer can check it", () => {
    const match = proposeMatch(
      supplier(),
      { firmName: "GRUPO AGRICOLA DEL VALLE SA DE CV", firmCountry: "Mexico", firmFei: null },
      lookup
    );
    expect(match!.rationale).toContain("GRUPO AGRICOLA DEL VALLE SA DE CV");
    expect(match!.rationale).toContain("Grupo Agricola del Valle");
    expect(match!.rationale.toLowerCase()).toContain("confirm");
  });
});

describe("proposeMatches", () => {
  it("surfaces every plausible supplier rather than picking one", () => {
    // Two of our suppliers share a name in the same country. Choosing for the
    // reviewer would hide the ambiguity that makes this worth a human.
    const entities = [
      supplier({ id: "a", name: "Valle Foods" }),
      supplier({ id: "b", name: "Valle Foods S.A. de C.V." }),
      supplier({ id: "c", name: "Northern Grain Traders" }),
    ];
    const results = proposeMatches(
      entities,
      { firmName: "Valle Foods", firmCountry: "Mexico", firmFei: null },
      lookup
    );
    expect(results.map((r) => r.entity.id).sort()).toEqual(["a", "b"]);
  });

  it("orders the strongest candidate first", () => {
    const entities = [
      supplier({ id: "fuzzy", name: "Pacifc Seafood Exports" }),
      supplier({ id: "exact", name: "Pacific Seafood Exports" }),
    ];
    const results = proposeMatches(
      entities,
      { firmName: "Pacific Seafood Exports", firmCountry: "Mexico", firmFei: null },
      lookup
    );
    expect(results[0].entity.id).toBe("exact");
  });

  it("returns nothing when no entity qualifies", () => {
    expect(
      proposeMatches(
        [supplier({ name: "Northern Grain Traders" })],
        { firmName: "Southern Fruit Packers", firmCountry: "Mexico", firmFei: null },
        lookup
      )
    ).toEqual([]);
  });
});
