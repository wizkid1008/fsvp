import { describe, expect, it } from "vitest";
import { formatAnswer, renderFormResponseHtml, type RenderMeta } from "./render";
import { parseFormSchema, type FormSchema } from "./schema";

const SCHEMA: FormSchema = (() => {
  const result = parseFormSchema({
    sections: [
      {
        key: "s1",
        title: "Food Safety",
        fields: [
          { key: "company", type: "text", label: "Company", required: true },
          { key: "has_plan", type: "yes_no", label: "Do you have a plan?", flag_answer: "no" },
          { key: "notes", type: "textarea", label: "Notes", help: "Optional detail" },
          { key: "confirmed", type: "checkbox", label: "I confirm" },
        ],
      },
    ],
  });
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.schema;
})();

const META: RenderMeta = {
  supplierName: "Andes Ingredients",
  formTitle: "FSVP Supplier Questionnaire",
  version: 1,
  submittedByName: "Lucia Ramos",
  submittedAt: "2026-07-31",
  evidenceSource: "supplier_attested",
};

describe("formatAnswer", () => {
  it("renders booleans and yes_no readably", () => {
    expect(formatAnswer(true, "checkbox")).toBe("Yes");
    expect(formatAnswer(false, "checkbox")).toBe("No");
    expect(formatAnswer("yes", "yes_no")).toBe("Yes");
    expect(formatAnswer("no", "yes_no")).toBe("No");
  });

  it("returns empty for genuinely unanswered values", () => {
    expect(formatAnswer(undefined, "text")).toBe("");
    expect(formatAnswer(null, "text")).toBe("");
    expect(formatAnswer("  ", "text")).toBe("");
  });

  it("does not treat a false checkbox as unanswered", () => {
    expect(formatAnswer(false, "checkbox")).not.toBe("");
  });
});

describe("renderFormResponseHtml", () => {
  const answers = { company: "Andes Ingredients", has_plan: "no", confirmed: true };
  const html = renderFormResponseHtml(SCHEMA, answers, META);

  it("includes every question, answered or not", () => {
    expect(html).toContain("Company");
    expect(html).toContain("Do you have a plan?");
    expect(html).toContain("Notes");
    expect(html).toContain("I confirm");
  });

  it("states unanswered questions rather than leaving them blank", () => {
    expect(html).toContain("Not answered");
  });

  it("carries the identifying metadata", () => {
    expect(html).toContain("Andes Ingredients");
    expect(html).toContain("Lucia Ramos");
    expect(html).toContain("Version 1");
    expect(html).toContain("Completed by the supplier");
  });

  it("marks flagged answers and says they are not automatic failures", () => {
    expect(html).toContain("1 answer marked for review");
    expect(html).toContain("not automatic failures");
  });

  it("omits the flag note entirely when nothing is flagged", () => {
    const clean = renderFormResponseHtml(SCHEMA, { company: "X", has_plan: "yes" }, META);
    expect(clean).not.toContain("marked for review");
  });

  it("escapes answers and metadata so a submission cannot inject markup", () => {
    const nasty = renderFormResponseHtml(
      SCHEMA,
      { company: '<script>alert(1)</script>' },
      { ...META, submittedByName: '"><img onerror=alert(1)>' }
    );
    expect(nasty).not.toContain("<script>alert(1)</script>");
    expect(nasty).toContain("&lt;script&gt;");
    expect(nasty).not.toContain("<img onerror");
  });

  it("reports how many questions were left unanswered", () => {
    expect(html).toContain("was left unanswered");
  });
});
