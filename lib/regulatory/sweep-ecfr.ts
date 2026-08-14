/**
 * The daily pass that asks eCFR whether the law under each rule has moved.
 *
 * It never edits a rule's substance. All it does is stamp source_changed_at,
 * which the review sweep already treats as outranking the schedule — so a rule
 * due in 2027 whose section was amended today gets raised today. A person still
 * does the re-check; this only tells them to.
 *
 * Decision logic is pure and tested in ./ecfr.ts. This file is the I/O.
 */

import { detectChange, ecfrVersionsUrl, parseCfrCitation, type EcfrVersion } from "./ecfr";

type AdminClient = { from: (table: string) => any };

export type EcfrSweep = {
  checked: number;
  flagged: number;
  /** Citations that could not be parsed — reported, never guessed at. */
  unparsed: string[];
  /** Parts the API would not answer for. */
  unreachable: string[];
};

type RuleRow = {
  id: string;
  citation: string;
  reviewed_at: string;
  source_changed_at: string | null;
};

export async function sweepEcfrChanges(
  admin: AdminClient,
  fetchImpl: typeof fetch = fetch
): Promise<EcfrSweep> {
  const { data, error } = await (admin.from("country_commodity_rules") as any)
    .select("id, citation, reviewed_at, source_changed_at")
    .is("superseded_at", null);

  if (error) throw new Error(`eCFR sweep could not read the reference layer: ${error.message}`);

  const rules = (data ?? []) as RuleRow[];
  const result: EcfrSweep = { checked: 0, flagged: 0, unparsed: [], unreachable: [] };
  if (rules.length === 0) return result;

  // One request per distinct part, not per rule. Part 319 alone returns ~600
  // versions, and a tenant with fifty mango rules all cite it.
  const cache = new Map<string, EcfrVersion[] | null>();

  for (const rule of rules) {
    // Already flagged and not yet re-verified. Re-stamping would move the date
    // forward and make an old change look new.
    if (rule.source_changed_at) continue;

    const ref = parseCfrCitation(rule.citation);
    if (!ref) {
      result.unparsed.push(rule.citation);
      continue;
    }

    const url = ecfrVersionsUrl(ref);
    if (!cache.has(url)) {
      try {
        const res = await fetchImpl(url, { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json() as { content_versions?: EcfrVersion[] };
        cache.set(url, body.content_versions ?? []);
      } catch {
        cache.set(url, null);
      }
    }

    const versions = cache.get(url);
    if (versions === null) {
      if (!result.unreachable.includes(ref.part)) result.unreachable.push(ref.part);
      continue;
    }

    result.checked += 1;

    const verdict = detectChange(ref, versions ?? [], rule.reviewed_at);
    if (!verdict.changed) continue;

    await (admin.from("country_commodity_rules") as any)
      .update({ source_changed_at: verdict.amendedOn })
      .eq("id", rule.id);

    result.flagged += 1;
  }

  return result;
}
