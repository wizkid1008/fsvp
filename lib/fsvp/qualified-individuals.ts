import type { QualificationBasis } from "@/types/database";

export const QUALIFICATION_BASES: QualificationBasis[] = [
  "education",
  "training",
  "experience",
  "combination",
];

export const QUALIFICATION_BASIS_LABEL: Record<QualificationBasis, string> = {
  education: "Education",
  training: "Training",
  experience: "Job experience",
  combination: "Combination",
};

export function isQualificationBasis(value: unknown): value is QualificationBasis {
  return typeof value === "string" && (QUALIFICATION_BASES as string[]).includes(value);
}

/**
 * Splits a comma- or newline-separated form field into a trimmed array, or null
 * when nothing is left. Used for the `languages` and `scope` text[] columns,
 * where an empty array and "not stated" mean different things — scope[] empty
 * means unrestricted within the tenant.
 */
export function toList(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const cleaned = value.map((v) => String(v).trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : null;
  }
  if (typeof value !== "string") return null;
  const cleaned = value.split(/[\n,]/).map((v) => v.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

/** True when `on` falls inside the QI's active window. */
export function isActiveOn(
  qi: { active_from: string; active_to: string | null },
  on: Date = new Date()
): boolean {
  const day = on.toISOString().slice(0, 10);
  if (day < qi.active_from) return false;
  if (qi.active_to && day > qi.active_to) return false;
  return true;
}
