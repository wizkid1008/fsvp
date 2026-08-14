import { describe, expect, it } from "vitest";
import { detectChange, ecfrVersionsUrl, parseCfrCitation, type EcfrVersion } from "./ecfr";

describe("parseCfrCitation", () => {
  it("parses the form our rules actually use", () => {
    expect(parseCfrCitation("7 CFR 319.56-12")).toEqual({
      title: 7, part: "319", section: "319.56-12",
    });
  });

  it("tolerates the section sign and periods in C.F.R.", () => {
    expect(parseCfrCitation("7 C.F.R. § 319.56-12")).toEqual({
      title: 7, part: "319", section: "319.56-12",
    });
  });

  it("parses a plain section without a hyphen", () => {
    expect(parseCfrCitation("21 CFR 1.230")).toEqual({
      title: 21, part: "1", section: "1.230",
    });
  });

  it("treats a part-only citation as covering the whole part", () => {
    expect(parseCfrCitation("7 CFR Part 319")).toEqual({
      title: 7, part: "319", section: null,
    });
  });

  it("refuses what it cannot parse rather than guessing", () => {
    // Polling the wrong part is worse than polling none: it produces either
    // silence about a rule that changed or noise about one that did not.
    expect(parseCfrCitation("APHIS ACIR entry for mango")).toBeNull();
    expect(parseCfrCitation("")).toBeNull();
    expect(parseCfrCitation("99 CFR 1.1")).toBeNull(); // no title 99
  });

  it("builds the versioner URL the live API answered on", () => {
    expect(ecfrVersionsUrl({ title: 7, part: "319", section: "319.56-12" }))
      .toBe("https://www.ecfr.gov/api/versioner/v1/versions/title-7.json?part=319");
  });
});

const v = (over: Partial<EcfrVersion> = {}): EcfrVersion => ({
  identifier: "319.56-12",
  amendment_date: "2026-06-14",
  substantive: true,
  removed: false,
  ...over,
});

const REF = { title: 7, part: "319", section: "319.56-12" };

describe("detectChange", () => {
  it("reports nothing when the section has not moved since review", () => {
    expect(detectChange(REF, [v({ amendment_date: "2024-01-01" })], "2026-01-01"))
      .toEqual({ changed: false });
  });

  it("reports an amendment made after the rule was reviewed", () => {
    expect(detectChange(REF, [v({ amendment_date: "2026-06-14" })], "2026-01-01"))
      .toEqual({ changed: true, amendedOn: "2026-06-14", removed: false });
  });

  it("ignores non-substantive versions", () => {
    // 62 of 598 records for part 319 are editorial. Raising those would make
    // the signal a nuisance, and a nuisance gets switched off.
    expect(detectChange(REF, [v({ substantive: false })], "2026-01-01"))
      .toEqual({ changed: false });
  });

  it("ignores other sections in the same part", () => {
    expect(detectChange(REF, [v({ identifier: "319.56-11" })], "2026-01-01"))
      .toEqual({ changed: false });
  });

  it("compares every section when the rule cites a whole part", () => {
    // A rule citing the part claims to rest on all of it.
    const partRef = { title: 7, part: "319", section: null };
    expect(detectChange(partRef, [v({ identifier: "319.40-2" })], "2026-01-01"))
      .toEqual({ changed: true, amendedOn: "2026-06-14", removed: false });
  });

  it("reports the most recent amendment when there are several", () => {
    const verdict = detectChange(
      REF,
      [v({ amendment_date: "2026-03-01" }), v({ amendment_date: "2026-06-14" }), v({ amendment_date: "2026-04-01" })],
      "2026-01-01"
    );
    expect(verdict).toEqual({ changed: true, amendedOn: "2026-06-14", removed: false });
  });

  it("surfaces a removed section, which is the sharpest case of all", () => {
    // A rule resting on a section that no longer exists is not merely stale.
    const verdict = detectChange(REF, [v({ removed: true })], "2026-01-01");
    expect(verdict).toEqual({ changed: true, amendedOn: "2026-06-14", removed: true });
  });

  it("does not re-raise an amendment made on the review date itself", () => {
    // Reviewed that day means the reviewer saw it.
    expect(detectChange(REF, [v({ amendment_date: "2026-06-14" })], "2026-06-14"))
      .toEqual({ changed: false });
  });

  it("accepts a timestamp for `since`, not just a date", () => {
    expect(detectChange(REF, [v({ amendment_date: "2026-06-14" })], "2026-06-14T09:12:00Z"))
      .toEqual({ changed: false });
  });
});
