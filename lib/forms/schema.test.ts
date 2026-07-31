import { describe, expect, it } from "vitest";
import {
  allFields,
  flaggedAnswers,
  parseFormSchema,
  validateAnswers,
  type FormSchema,
} from "./schema";

const VALID = {
  sections: [
    {
      key: "a",
      title: "Section A",
      fields: [
        { key: "name", type: "text", label: "Name", required: true },
        { key: "has_plan", type: "yes_no", label: "Do you have a plan?", required: true, flag_answer: "no" },
        {
          key: "scheme",
          type: "select",
          label: "Scheme",
          options: [{ value: "sqf", label: "SQF" }, { value: "brcgs", label: "BRCGS" }],
        },
        { key: "confirmed", type: "checkbox", label: "I confirm", required: true },
      ],
    },
  ],
};

function parsed(): FormSchema {
  const result = parseFormSchema(VALID);
  if (!result.ok) throw new Error(result.errors.join("; "));
  return result.schema;
}

describe("parseFormSchema", () => {
  it("accepts a valid schema and normalises optional flags", () => {
    const result = parseFormSchema(VALID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [name, hasPlan, scheme] = result.schema.sections[0].fields;
    expect(name.required).toBe(true);
    expect(scheme.required).toBe(false); // absent → false, not undefined
    expect(hasPlan.flag_answer).toBe("no");
    expect(scheme.options).toHaveLength(2);
  });

  it("accepts a JSON string, as the admin editor supplies", () => {
    expect(parseFormSchema(JSON.stringify(VALID)).ok).toBe(true);
  });

  it("reports unparseable JSON rather than throwing", () => {
    const result = parseFormSchema("{ not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("Not valid JSON");
  });

  it("rejects an unknown field type and names the offender", () => {
    const result = parseFormSchema({
      sections: [{ key: "a", title: "A", fields: [{ key: "x", type: "txt", label: "X" }] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain('"x"');
    expect(result.errors[0]).toContain("txt");
  });

  it("rejects duplicate field keys across different sections", () => {
    const result = parseFormSchema({
      sections: [
        { key: "a", title: "A", fields: [{ key: "dupe", type: "text", label: "One" }] },
        { key: "b", title: "B", fields: [{ key: "dupe", type: "text", label: "Two" }] },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("duplicate field key");
  });

  it("requires options on a select", () => {
    const result = parseFormSchema({
      sections: [{ key: "a", title: "A", fields: [{ key: "s", type: "select", label: "S" }] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("options");
  });

  it("rejects flag_answer on a field that is not yes_no", () => {
    const result = parseFormSchema({
      sections: [{ key: "a", title: "A", fields: [{ key: "t", type: "text", label: "T", flag_answer: "no" }] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("yes_no");
  });

  it("rejects an empty form", () => {
    expect(parseFormSchema({ sections: [] }).ok).toBe(false);
    expect(parseFormSchema({}).ok).toBe(false);
    expect(parseFormSchema(null).ok).toBe(false);
  });
});

describe("validateAnswers", () => {
  it("passes a fully answered form", () => {
    const result = validateAnswers(parsed(), {
      name: "Andes Ingredients",
      has_plan: "yes",
      scheme: "sqf",
      confirmed: true,
    });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("reports every missing required field", () => {
    const result = validateAnswers(parsed(), {});
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(3); // name, has_plan, confirmed — scheme is optional
  });

  it("treats an unticked required checkbox as missing", () => {
    const result = validateAnswers(parsed(), {
      name: "X", has_plan: "yes", confirmed: false,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("must be ticked"))).toBe(true);
  });

  it("rejects a select value that is not one of the options", () => {
    const result = validateAnswers(parsed(), {
      name: "X", has_plan: "yes", confirmed: true, scheme: "made_up",
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("listed options");
  });

  it("rejects a yes_no answer that is neither", () => {
    const result = validateAnswers(parsed(), {
      name: "X", has_plan: "maybe", confirmed: true,
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("yes or no");
  });

  it("treats whitespace as unanswered", () => {
    const result = validateAnswers(parsed(), {
      name: "   ", has_plan: "yes", confirmed: true,
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("required");
  });
});

describe("flaggedAnswers", () => {
  it("returns the answers matching flag_answer", () => {
    const flagged = flaggedAnswers(parsed(), { name: "X", has_plan: "no", confirmed: true });
    expect(flagged).toHaveLength(1);
    expect(flagged[0].field.key).toBe("has_plan");
  });

  it("returns nothing when the flagged answer was not given", () => {
    expect(flaggedAnswers(parsed(), { has_plan: "yes" })).toEqual([]);
    expect(flaggedAnswers(parsed(), {})).toEqual([]);
  });
});

describe("allFields", () => {
  it("flattens across sections in order", () => {
    expect(allFields(parsed()).map((f) => f.key)).toEqual(["name", "has_plan", "scheme", "confirmed"]);
  });
});
