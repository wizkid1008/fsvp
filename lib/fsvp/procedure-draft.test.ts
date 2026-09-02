import { describe, expect, it } from "vitest";
import {
  draftApprovedSupplierProcedure,
  draftRecordsProcedure,
  parseReviewPrompts,
  resolveReviewPrompt,
  reviewMarkers,
  sectionsToText,
  type ProcedureFacts,
} from "./procedure-draft";

function facts(over: Partial<ProcedureFacts> = {}): ProcedureFacts {
  return {
    organizationName: "Nutty Cathy",
    dunsNumber: "123456789",
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
