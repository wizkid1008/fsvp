/**
 * The shape of a form definition, and validation for both the definition and
 * the answers given to it.
 *
 * Validated here rather than by a database check constraint so that an
 * authoring mistake surfaces in the admin screen as "section 2, field 3: unknown
 * type 'txt'" instead of as a Postgres error, and so the same code can validate
 * a submission on the way in.
 */

export const FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "date",
  "number",
  "select",
  "radio",
  "checkbox",
  "yes_no",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type FieldOption = { value: string; label: string };

export type FormField = {
  key: string;
  type: FieldType;
  label: string;
  help?: string;
  required?: boolean;
  placeholder?: string;
  /** select/radio only. */
  options?: FieldOption[];
  /**
   * yes_no only. The answer a reviewer should look at twice — "no" to "do you
   * have a recall plan", "yes" to "have you had a shipment refused".
   *
   * Advisory: it highlights the answer for the reviewer and does nothing else.
   * A self-assessment answer is not a determination, and making one
   * automatically fail a requirement item is a policy decision to take
   * deliberately rather than as a side effect of authoring a question.
   */
  flag_answer?: "yes" | "no";
};

export type FormSection = {
  key: string;
  title: string;
  description?: string;
  fields: FormField[];
};

export type FormSchema = { sections: FormSection[] };

export type AnswerValue = string | number | boolean | null;
export type FormAnswers = Record<string, AnswerValue>;

export type ParseResult =
  | { ok: true; schema: FormSchema }
  | { ok: false; errors: string[] };

const OPTION_TYPES: FieldType[] = ["select", "radio"];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parses and validates a form definition. Accepts the raw jsonb value from
 * `form_definitions.schema_json`, or a JSON string from the admin editor.
 */
export function parseFormSchema(input: unknown): ParseResult {
  let raw: unknown = input;

  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch (err) {
      return { ok: false, errors: [`Not valid JSON: ${err instanceof Error ? err.message : "parse failed"}`] };
    }
  }

  const errors: string[] = [];

  if (!isPlainObject(raw)) return { ok: false, errors: ["The form must be a JSON object."] };
  if (!Array.isArray(raw.sections)) return { ok: false, errors: ["The form must have a `sections` array."] };
  if (raw.sections.length === 0) return { ok: false, errors: ["The form needs at least one section."] };

  const seenSectionKeys = new Set<string>();
  // Field keys must be unique across the WHOLE form, not per section: answers
  // are stored as one flat object keyed by field key, so a duplicate would mean
  // two questions silently sharing an answer.
  const seenFieldKeys = new Set<string>();
  const sections: FormSection[] = [];

  raw.sections.forEach((rawSection: unknown, si: number) => {
    const where = `Section ${si + 1}`;

    if (!isPlainObject(rawSection)) {
      errors.push(`${where}: must be an object.`);
      return;
    }
    if (typeof rawSection.key !== "string" || !rawSection.key.trim()) {
      errors.push(`${where}: needs a non-empty \`key\`.`);
      return;
    }
    if (typeof rawSection.title !== "string" || !rawSection.title.trim()) {
      errors.push(`${where}: needs a non-empty \`title\`.`);
      return;
    }
    if (seenSectionKeys.has(rawSection.key)) {
      errors.push(`${where}: duplicate section key "${rawSection.key}".`);
      return;
    }
    seenSectionKeys.add(rawSection.key);

    if (!Array.isArray(rawSection.fields) || rawSection.fields.length === 0) {
      errors.push(`${where}: needs a non-empty \`fields\` array.`);
      return;
    }

    const fields: FormField[] = [];

    rawSection.fields.forEach((rawField: unknown, fi: number) => {
      const fieldWhere = `${where}, field ${fi + 1}`;

      if (!isPlainObject(rawField)) {
        errors.push(`${fieldWhere}: must be an object.`);
        return;
      }
      if (typeof rawField.key !== "string" || !rawField.key.trim()) {
        errors.push(`${fieldWhere}: needs a non-empty \`key\`.`);
        return;
      }
      if (typeof rawField.label !== "string" || !rawField.label.trim()) {
        errors.push(`${fieldWhere} ("${rawField.key}"): needs a non-empty \`label\`.`);
        return;
      }
      if (typeof rawField.type !== "string" || !(FIELD_TYPES as readonly string[]).includes(rawField.type)) {
        errors.push(
          `${fieldWhere} ("${rawField.key}"): unknown type ${JSON.stringify(rawField.type)}. ` +
          `Expected one of ${FIELD_TYPES.join(", ")}.`
        );
        return;
      }
      if (seenFieldKeys.has(rawField.key)) {
        errors.push(`${fieldWhere}: duplicate field key "${rawField.key}" — field keys must be unique across the whole form.`);
        return;
      }
      seenFieldKeys.add(rawField.key);

      const type = rawField.type as FieldType;

      let options: FieldOption[] | undefined;
      if (OPTION_TYPES.includes(type)) {
        if (!Array.isArray(rawField.options) || rawField.options.length === 0) {
          errors.push(`${fieldWhere} ("${rawField.key}"): a ${type} field needs a non-empty \`options\` array.`);
          return;
        }
        options = [];
        for (const opt of rawField.options) {
          if (!isPlainObject(opt) || typeof opt.value !== "string" || typeof opt.label !== "string") {
            errors.push(`${fieldWhere} ("${rawField.key}"): every option needs a string \`value\` and \`label\`.`);
            return;
          }
          options.push({ value: opt.value, label: opt.label });
        }
      }

      if (rawField.flag_answer !== undefined) {
        if (type !== "yes_no") {
          errors.push(`${fieldWhere} ("${rawField.key}"): \`flag_answer\` only applies to a yes_no field.`);
          return;
        }
        if (rawField.flag_answer !== "yes" && rawField.flag_answer !== "no") {
          errors.push(`${fieldWhere} ("${rawField.key}"): \`flag_answer\` must be "yes" or "no".`);
          return;
        }
      }

      fields.push({
        key: rawField.key,
        type,
        label: rawField.label,
        help: typeof rawField.help === "string" ? rawField.help : undefined,
        required: rawField.required === true,
        placeholder: typeof rawField.placeholder === "string" ? rawField.placeholder : undefined,
        options,
        flag_answer: rawField.flag_answer as "yes" | "no" | undefined,
      });
    });

    sections.push({
      key: rawSection.key,
      title: rawSection.title,
      description: typeof rawSection.description === "string" ? rawSection.description : undefined,
      fields,
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, schema: sections.length > 0 ? { sections } : { sections: [] } };
}

/** Every field in the form, in order, flattened across sections. */
export function allFields(schema: FormSchema): FormField[] {
  return schema.sections.flatMap((s) => s.fields);
}

function isBlank(value: AnswerValue | undefined): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

export type AnswerValidation = { ok: boolean; errors: string[] };

/**
 * Checks a set of answers against the form. Used on submit — a draft is
 * deliberately allowed to be incomplete.
 */
export function validateAnswers(schema: FormSchema, answers: FormAnswers): AnswerValidation {
  const errors: string[] = [];

  for (const field of allFields(schema)) {
    const value = answers[field.key];

    if (isBlank(value)) {
      // An unticked required checkbox arrives as false, not blank, and is
      // handled below — this branch is for genuinely unanswered fields.
      if (field.required && field.type !== "checkbox") {
        errors.push(`${field.label} is required.`);
      } else if (field.required && field.type === "checkbox") {
        errors.push(`${field.label} must be ticked.`);
      }
      continue;
    }

    switch (field.type) {
      case "checkbox":
        if (typeof value !== "boolean") errors.push(`${field.label}: expected a yes/no value.`);
        else if (field.required && value === false) errors.push(`${field.label} must be ticked.`);
        break;

      case "yes_no":
        if (value !== "yes" && value !== "no") errors.push(`${field.label}: answer yes or no.`);
        break;

      case "number":
        if (typeof value !== "number" || Number.isNaN(value)) errors.push(`${field.label}: enter a number.`);
        break;

      case "email":
        if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push(`${field.label}: enter a valid email address.`);
        }
        break;

      case "date":
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          errors.push(`${field.label}: enter a date.`);
        }
        break;

      case "select":
      case "radio":
        if (typeof value !== "string" || !(field.options ?? []).some((o) => o.value === value)) {
          errors.push(`${field.label}: choose one of the listed options.`);
        }
        break;

      default:
        if (typeof value !== "string") errors.push(`${field.label}: expected text.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * The answers a reviewer should look at twice. Empty when nothing was flagged.
 */
export function flaggedAnswers(
  schema: FormSchema,
  answers: FormAnswers
): Array<{ field: FormField; answer: AnswerValue }> {
  return allFields(schema)
    .filter((f) => f.flag_answer !== undefined && answers[f.key] === f.flag_answer)
    .map((f) => ({ field: f, answer: answers[f.key] }));
}
