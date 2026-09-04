/**
 * Reading FDA's subclass and PIC tables into dropdown options.
 *
 * Lifted out of app/api/products/fda-code/options/route.ts so it can be tested
 * directly. This is judgement, not plumbing: it decides which character goes on
 * an entry line, and it got that wrong for a real FDA row while looking correct
 * for every other row in the same table. That is the kind of code this codebase
 * keeps in lib/ with its reasoning pinned by tests.
 *
 * FDA's columns, from a live response rather than a guess:
 *
 *   subclass   INDID, SUBCLASSID, SUBCLASSCODE, SUBCLASSDESC
 *   pic        INDID, PICID,      PICCODE,      PICDESC
 *
 * CODE is the element. ID is a surrogate row key that means nothing outside
 * FDA's own database.
 */

export type PcbOption = {
  code: string;
  name: string | null;
  raw: Record<string, string | null>;
};

const isCode = (value: string | null) => Boolean(value && /^[A-Z0-9-]$/i.test(value.trim()));

/**
 * The single character FDA uses for this element.
 *
 * Subclass and PIC are one character by definition, so the whole cell is the
 * code — matching a character out of the middle of a longer string could lift
 * a letter out of a name.
 *
 * The CODE column is matched by name first, and that is the whole fix. Fabric's
 * SUBCLASSID is "7" and its SUBCLASSCODE is "A": a one-character id is
 * indistinguishable from a code by shape alone, so "first single-character
 * cell" returned 7 and would have put a wrong character on an entry line. Every
 * other row in that industry had a two-digit id and came out right, which is
 * how a bug like this survives being looked at.
 */
export function optionCode(
  row: Record<string, string | null>,
  kind: "subclass" | "pic"
): string | null {
  const entries = Object.entries(row);

  const byCodeColumn = entries.find(([key, value]) => /code$/i.test(key) && isCode(value))?.[1];
  if (byCodeColumn) return byCodeColumn.trim().toUpperCase();

  // No column named CODE. Prefer one named for this element, then settle for
  // any single-character cell — but never an id column, for the same reason.
  const kindKey = kind === "subclass" ? /subcl/i : /pic/i;
  const notAnId = ([key, value]: [string, string | null]) => !/id$/i.test(key) && isCode(value);

  const kindMatch = entries.find((entry) => kindKey.test(entry[0]) && notAnId(entry))?.[1];
  const anyCell = entries.find(notAnId)?.[1];
  return (kindMatch ?? anyCell)?.trim().toUpperCase() ?? null;
}

/**
 * The readable name for an option, or null when FDA gave us nothing but the
 * code.
 *
 * FDA abbreviates: the description column is PICDESC or SUBCLASSDESC, never
 * DESCRIPTION, so a /(name|description)/ pattern matched no column at all. The
 * fallback then took the first value containing any letter — which is the
 * one-character code itself — and the dropdown rendered "G - G", naming
 * nothing.
 *
 * The length guard is what makes this hold whatever FDA calls the column: a
 * real name has two or more letters, a code never does. Returning null rather
 * than echoing the code lets the caller show a bare letter honestly instead of
 * dressing it up as its own description.
 */
export function optionName(
  row: Record<string, string | null>,
  code: string | null
): string | null {
  const labelled = Object.entries(row).find(([key, value]) =>
    Boolean(value && /(desc|name|title)/i.test(key) && value.trim().length > 1)
  )?.[1];
  const anyText = Object.values(row).find((value) => Boolean(value && /[A-Za-z]{2,}/.test(value.trim())));

  const name = (labelled ?? anyText ?? "").replace(/\s+-\s+[A-Z0-9-]\s*$/, "").trim();
  if (!name || name.toUpperCase() === code?.toUpperCase()) return null;
  return name;
}

/** One FDA row as a dropdown option, or null when it carries no usable code. */
export function shapeOption(
  row: Record<string, string | null>,
  kind: "subclass" | "pic"
): PcbOption | null {
  const code = optionCode(row, kind);
  if (!code) return null;
  return { code, name: optionName(row, code), raw: row };
}
