/**
 * The shape every source normalises into before it reaches the database.
 *
 * Kept separate from any one client so adding a source is a matter of writing a
 * fetcher and a normaliser, not touching the ingest orchestration. The columns
 * mirror `regulatory_events` in 009_regulatory_intelligence.sql.
 *
 * `firm_name`, `firm_fei` and `firm_country` are stored EXACTLY as the source
 * published them, never normalised in place. The matching layer derives
 * comparable forms at compare time, and an investigator asking "why did you
 * think this was our supplier" is entitled to see the string FDA actually
 * printed rather than our cleaned-up version of it.
 */

import type { RegulatorySourceId, RegulatoryEventType } from "./sources";

export type NormalisedEvent = {
  source: RegulatorySourceId;
  /** The source's own identifier. Unique with `source`; the dedupe key. */
  source_ref: string;
  event_type: RegulatoryEventType;
  event_date: string | null;
  firm_name: string | null;
  firm_fei: string | null;
  firm_country: string | null;
  firm_address: string | null;
  product_description: string | null;
  /** One line for the review queue: who, and what happened. */
  summary: string;
  /** The source's own severity vocabulary, where it has one. */
  classification: string | null;
  /** Everything the source returned, so a later question needs no re-fetch. */
  detail_json: unknown;
  source_url: string | null;
};

/** Truncates a reason to something a queue row can carry without wrapping. */
export function shorten(text: string | null | undefined, max = 180): string {
  const clean = (text ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** `YYYYMMDD` or `YYYY-MM-DD` or an ISO timestamp → `YYYY-MM-DD`, else null. */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // FDA's dashboards have been seen emitting MM/DD/YYYY in CSV exports; accept
  // it rather than silently dropping the date and leaving an undated finding.
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}
