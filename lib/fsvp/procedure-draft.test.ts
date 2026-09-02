import { describe, expect, it } from "vitest";
import { IMPORTER_RECORD_KINDS } from "./importer-records";
import {
  draftApprovedSupplierProcedure,
  draftHazardAnalysisReliance,
  draftImporterIdentification,
  draftRecordsProcedure,
  parseReviewPrompts,
  PROCEDURE_DRAFTERS,
  PROCEDURE_KINDS,
  resolveReviewPrompt,
  reviewMarkers,
  sectionsToText,
  type ProcedureFacts,
} from "./procedure-draft";

function facts(over: Partial<ProcedureFacts> = {}): ProcedureFacts {
  return {
    organizationName: "Nutty Cathy",
    dunsNumber: "123456789",
    contactEmail: "fsvp@nuttycathy.example",
    foodScope: "human",
    qualifiedIndividuals: [{ name: "Dana Reyes", basis: "education" }],
    reassessmentMonths: [12],
    retentionYears: 2,
    ...over,
  };
}

describe("draftApprovedSupplierProcedure", () => {
  it("states all four approval conditions the platform actually enforces", () => {
    const text = sectionsToText(draftApprovedSupplierProcedure(facts()));

    expect(text).toContain("1.504");   // hazard analysis
    expect(text).toContain("1.505");   // supplier evaluation
    expect(text).toContain("1.506(d)"); // verification determination
    expect(text).toContain("1.507");   // written assurance
    expect(text).toContain("applicability determination");
    expect(text).toContain("critical gap");
  });

  it("names the organization rather than leaving a placeholder", () => {
    const text = sectionsToText(draftApprovedSupplierProcedure(facts({ organizationName: "Acme Imports" })));
    expect(text).toContain("Acme Imports");
    expect(text).not.toMatch(/\{\{|\[COMPANY|XXX/);
  });

  it("cites the D-U-N-S when there is one, and says so when there is not", () => {
    expect(sectionsToText(draftApprovedSupplierProcedure(facts({ dunsNumber: "987654321" }))))
      .toContain("D-U-N-S 987654321");

    const without = sectionsToText(draftApprovedSupplierProcedure(facts({ dunsNumber: null })));
    expect(without).not.toContain("D-U-N-S 9");
    expect(without).toContain("1.509");
  });

  it("names the qualified individuals on the register", () => {
    const text = sectionsToText(draftApprovedSupplierProcedure(facts({
      qualifiedIndividuals: [
        { name: "Dana Reyes", basis: "education" },
        { name: "Sam Okafor", basis: "experience" },
      ],
    })));
    expect(text).toContain("Dana Reyes and Sam Okafor");
  });

  it("refuses to imply a QI exists when the register is empty", () => {
    // Generating a procedure that claims qualified oversight when there is
    // none would be a false statement in the document FDA reads first.
    const text = sectionsToText(draftApprovedSupplierProcedure(facts({ qualifiedIndividuals: [] })));
    expect(text).toContain("No qualified individual is currently");
    expect(text).toContain("before this procedure can be adopted");
  });

  it("reports the reassessment intervals actually in use", () => {
    const text = sectionsToText(draftApprovedSupplierProcedure(facts({ reassessmentMonths: [6, 12] })));
    expect(text).toContain("6 months and 12 months");
  });

  it("says no interval is in use rather than inventing one", () => {
    const text = sectionsToText(draftApprovedSupplierProcedure(facts({ reassessmentMonths: [] })));
    expect(text).toContain("No approvals have yet been recorded");
  });

  it("distinguishes human, animal and both in scope", () => {
    expect(sectionsToText(draftApprovedSupplierProcedure(facts({ foodScope: "both" }))))
      .toContain("human and animal");
  });
});

describe("review markers", () => {
  it("marks the passages the platform cannot know", () => {
    // Temporary import authority is a decision about the operation, not
    // something the system enforces — so it must not be silently asserted.
    const sections = draftApprovedSupplierProcedure(facts());
    expect(reviewMarkers(sections)).toContain("Importing before approval is complete");
  });

  it("marks paper and external records in the records procedure", () => {
    expect(reviewMarkers(draftRecordsProcedure(facts()))).toContain("Electronic records");
  });

  it("returns nothing for a draft with no open questions", () => {
    expect(reviewMarkers([{ heading: "Scope", body: "Settled." }])).toEqual([]);
  });
});

describe("draftRecordsProcedure", () => {
  it("states the retention period given, not a hardcoded one", () => {
    const text = sectionsToText(draftRecordsProcedure(facts({ retentionYears: 3 })));
    expect(text).toContain("3 years");
    expect(text).not.toContain("2 years");
  });

  it("explains that editing signed text voids the signature", () => {
    // The strongest true claim this platform can make about its records, and
    // the one an investigator is most likely to probe.
    expect(sectionsToText(draftRecordsProcedure(facts()))).toContain("signature is void");
  });

  it("states that a record inside retention cannot be deleted", () => {
    expect(sectionsToText(draftRecordsProcedure(facts()))).toContain("cannot be deleted");
  });
});

describe("sectionsToText", () => {
  it("keeps headings so the editor and a diff stay readable", () => {
    const text = sectionsToText([{ heading: "Scope", body: "Body." }]);
    expect(text).toBe("## Scope\n\nBody.");
  });
});

describe("parseReviewPrompts", () => {
  it("finds each outstanding passage and names the section it sits under", () => {
    const text = sectionsToText(draftApprovedSupplierProcedure(facts()));
    const prompts = parseReviewPrompts(text);

    expect(prompts).toHaveLength(1);
    expect(prompts[0].section).toBe("Importing before approval is complete");
    expect(prompts[0].prompt).toContain("who authorises a temporary import");
    expect(prompts[0].marker.startsWith("[REVIEW:")).toBe(true);
  });

  it("normalises the wrapped whitespace the draft carries", () => {
    const prompts = parseReviewPrompts("## Scope\n\n[REVIEW: one\ntwo   three]");
    expect(prompts[0].prompt).toBe("one two three");
  });

  it("reports nothing for a draft that has been fully answered", () => {
    expect(parseReviewPrompts("## Scope\n\nSettled, in full.")).toEqual([]);
  });

  it("returns a marker with no heading above it rather than skipping it", () => {
    const prompts = parseReviewPrompts("[REVIEW: say who signs]");
    expect(prompts).toHaveLength(1);
    expect(prompts[0].section).toBeNull();
  });
});

describe("resolveReviewPrompt", () => {
  const draft = "## Electronic records\n\nRecords stay legible.\n\n[REVIEW: describe paper originals]";

  it("puts the answer where the marker was", () => {
    const out = resolveReviewPrompt(draft, "[REVIEW: describe paper originals]", "Originals are held in Ohio.");
    expect(out).toBe("## Electronic records\n\nRecords stay legible.\n\nOriginals are held in Ohio.");
    expect(parseReviewPrompts(out)).toEqual([]);
  });

  it("takes the introducing blank line with a struck-out passage", () => {
    const out = resolveReviewPrompt(draft, "[REVIEW: describe paper originals]", "   ");
    expect(out).toBe("## Electronic records\n\nRecords stay legible.");
  });

  it("resolves one marker without disturbing another", () => {
    const two = "[REVIEW: first]\n\n[REVIEW: second]";
    const out = resolveReviewPrompt(two, "[REVIEW: second]", "Answered.");
    expect(out).toBe("[REVIEW: first]\n\nAnswered.");
  });

  it("leaves the draft alone when the marker is already gone", () => {
    expect(resolveReviewPrompt(draft, "[REVIEW: not present]", "x")).toBe(draft);
  });

  it("clears the adoption block the API enforces once every passage is answered", () => {
    let text = sectionsToText(draftRecordsProcedure(facts()));
    for (const prompt of parseReviewPrompts(text)) {
      text = resolveReviewPrompt(text, prompt.marker, "We keep no paper originals.");
    }
    expect(text).not.toContain("[REVIEW:");
  });
});

describe("draftImporterIdentification", () => {
  it("states the identifier the platform holds rather than asking for it", () => {
    const text = sectionsToText(draftImporterIdentification(facts()));

    expect(text).toContain("123456789");
    expect(text).toContain("fsvp@nuttycathy.example");
    expect(text).toContain("1.509");
    expect(text).toContain("FSV");
  });

  it("turns a missing D-U-N-S into a question instead of a statement naming none", () => {
    const text = sectionsToText(draftImporterIdentification(facts({ dunsNumber: null })));

    const prompts = parseReviewPrompts(text);
    expect(prompts.some((p) => p.section === "The identifier we transmit")).toBe(true);
    expect(prompts.some((p) => p.prompt.includes("no D-U-N-S number is recorded"))).toBe(true);
  });

  it("asks for the address § 1.509 transmits when none is on file", () => {
    const text = sectionsToText(draftImporterIdentification(facts({ contactEmail: null })));
    expect(parseReviewPrompts(text).some((p) => p.prompt.includes("electronic mail address"))).toBe(true);
  });

  it("leaves who files the entries and how currency is checked to the importer", () => {
    const sections = draftImporterIdentification(facts());
    expect(reviewMarkers(sections)).toEqual(
      expect.arrayContaining(["How it reaches CBP", "Keeping it current"])
    );
  });
});

describe("draftHazardAnalysisReliance", () => {
  it("says plainly that it does not apply to an importer doing its own analysis", () => {
    const text = sectionsToText(draftHazardAnalysisReliance(facts()));
    expect(text).toContain("1.504(a)");
    expect(text).toContain("should not be adopted");
  });

  it("keeps the § 1.505 and § 1.506(d) work with the importer", () => {
    const text = sectionsToText(draftHazardAnalysisReliance(facts()));
    expect(text).toContain("does not transfer responsibility");
    expect(text).toContain("1.505");
    expect(text).toContain("1.506(d)");
  });

  it("invents nothing about whose analysis it is or what the review found", () => {
    const headings = reviewMarkers(draftHazardAnalysisReliance(facts()));
    expect(headings).toEqual(
      expect.arrayContaining(["The analysis we rely on", "Our review and assessment"])
    );
  });

  it("names the qualified individuals who may review, and says so when there are none", () => {
    expect(sectionsToText(draftHazardAnalysisReliance(facts()))).toContain("Dana Reyes");

    const empty = sectionsToText(draftHazardAnalysisReliance(facts({ qualifiedIndividuals: [] })));
    expect(empty).toContain("No qualified individual is currently");
    expect(empty).toContain("1.503");
  });
});

describe("every drafted procedure", () => {
  const drafts = () => [
    draftApprovedSupplierProcedure(facts()),
    draftRecordsProcedure(facts()),
    draftImporterIdentification(facts()),
    draftHazardAnalysisReliance(facts()),
  ];

  it("leaves no review marker the editor cannot parse back out", () => {
    for (const sections of drafts()) {
      const text = sectionsToText(sections);
      const markerCount = (text.match(/\[REVIEW:/g) ?? []).length;
      expect(parseReviewPrompts(text)).toHaveLength(markerCount);
    }
  });

  it("can be answered to the point the adoption block lifts", () => {
    for (const sections of drafts()) {
      let text = sectionsToText(sections);
      for (const prompt of parseReviewPrompts(text)) {
        text = resolveReviewPrompt(text, prompt.marker, "Answered by the importer.");
      }
      expect(text).not.toContain("[REVIEW:");
      expect(text.length).toBeGreaterThan(40); // the API's minimum for a save
    }
  });

  it("names the organization and never leaves a template placeholder", () => {
    for (const sections of drafts()) {
      const text = sectionsToText(sections);
      expect(text).toContain("Nutty Cathy");
      expect(text).not.toMatch(/\{\{|\[COMPANY|XXX|TODO/);
    }
  });
});

describe("PROCEDURE_DRAFTERS", () => {
  it("only drafts obligations that exist on the record list", () => {
    // A key that matches nothing in IMPORTER_RECORD_KINDS would render an
    // editor for an obligation the page never shows, or none at all.
    const keys = IMPORTER_RECORD_KINDS.map((k) => k.key);
    for (const kind of PROCEDURE_KINDS) expect(keys).toContain(kind);
  });

  it("leaves the qualified individual's own evidence as an upload", () => {
    // A CV is external evidence about a person. The platform is not its system
    // of record and must not draft one.
    expect(PROCEDURE_KINDS).not.toContain("qi_qualifications");
  });

  it("produces a draft for every kind it claims to cover", () => {
    for (const kind of PROCEDURE_KINDS) {
      const text = sectionsToText(PROCEDURE_DRAFTERS[kind](facts()));
      expect(text.startsWith("## ")).toBe(true);
      expect(text.length).toBeGreaterThan(40);
    }
  });
});
