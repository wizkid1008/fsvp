import { describe, expect, it } from "vitest";
import {
  REGULATORY_SOURCES,
  findingSeverity,
  ingestableSources,
  sourceSpec,
  unscreenedSources,
} from "./sources";

describe("REGULATORY_SOURCES", () => {
  it("gives every source a citation, a cadence and a caveat", () => {
    // The caveat is the point of this table. A source presented without one
    // invites the reader to treat FDA data as a verdict on a supplier.
    for (const s of REGULATORY_SOURCES) {
      expect(s.referenceUrl).toMatch(/^https:\/\//);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.cadence.length).toBeGreaterThan(0);
      expect(s.caveat.length).toBeGreaterThan(0);
    }
  });

  it("uses distinct ids", () => {
    const ids = REGULATORY_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("marks import alerts as having no API", () => {
    // FDA publishes no machine interface for import alerts. If this ever
    // changes the caveat has to change with it, so the fact is pinned here.
    const alerts = sourceSpec("fda_import_alerts");
    expect(alerts?.access).toBe("manual");
    expect(alerts?.implemented).toBe(false);
  });

  it("marks the Data Dashboard sources as credentialed, not open", () => {
    // The roadmap originally described these as having "no gatekeeper". They
    // require an FDA-issued key via the OII Unified Logon.
    for (const id of [
      "fda_import_refusals",
      "fda_inspections_classifications",
      "fda_compliance_actions",
    ]) {
      expect(sourceSpec(id)?.access).toBe("credentialed");
    }
  });
});

describe("ingestableSources", () => {
  it("returns openFDA with no credentials configured", () => {
    expect(ingestableSources({})).toEqual(["fda_food_enforcement"]);
  });

  it("never returns a source that is not implemented yet", () => {
    const withCreds = ingestableSources({
      FDA_DATADASHBOARD_USER: "someone@example.com",
      FDA_DATADASHBOARD_KEY: "key",
    });
    for (const id of withCreds) {
      expect(sourceSpec(id)?.implemented).toBe(true);
    }
  });
});

describe("unscreenedSources", () => {
  it("reports everything not covered, so a screening cannot imply a clean sweep", () => {
    const gaps = unscreenedSources(["fda_food_enforcement"]);
    expect(gaps.map((s) => s.id)).toContain("fda_import_alerts");
    expect(gaps.map((s) => s.id)).not.toContain("fda_food_enforcement");
  });
});

describe("findingSeverity", () => {
  it("treats Class I as critical", () => {
    expect(findingSeverity("recall", "Class I")).toBe("critical");
    expect(findingSeverity("recall", "class i")).toBe("critical");
  });

  it("does NOT treat Class II or Class III as critical", () => {
    // The substring trap: "Class II" contains "Class I". Getting this wrong
    // would escalate every labelling recall to a serious-harm alert.
    expect(findingSeverity("recall", "Class II")).toBe("warning");
    expect(findingSeverity("recall", "Class III")).toBe("warning");
  });

  it("treats enforcement actions as critical regardless of classification", () => {
    expect(findingSeverity("warning_letter", null)).toBe("critical");
    expect(findingSeverity("seizure", null)).toBe("critical");
    expect(findingSeverity("injunction", null)).toBe("critical");
  });

  it("treats an OAI inspection outcome as critical and NAI as routine", () => {
    expect(findingSeverity("inspection_classification", "OAI")).toBe("critical");
    expect(findingSeverity("inspection_classification", "NAI")).toBe("info");
  });

  it("treats refusals and unclassified recalls as warnings", () => {
    expect(findingSeverity("import_refusal", null)).toBe("warning");
    expect(findingSeverity("recall", null)).toBe("warning");
  });
});
