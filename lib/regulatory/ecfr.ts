/**
 * Detecting that the law under a rule has moved.
 *
 * docs/reference-layer-curation.md, § 3.1, calls this the strongest thing that
 * can be automated and says to do it first: "It never edits a rule; it only
 * says 'the law under this moved on 2026-06-14, go and look.' A false positive
 * costs one re-check; a missed change costs a wrong answer."
 *
 * That asymmetry drives every decision here. This module never changes a rule's
 * substance, never marks one verified, and never resolves anything. It sets
 * source_changed_at, which the review sweep already treats as outranking the
 * schedule — a rule due in 2027 whose section was amended today needs looking
 * at today.
 *
 * VERIFIED AGAINST THE LIVE API on 2026-08-14, because the same document warns
 * that the Federal Register "blocks automated fetches from this environment"
 * and was never confirmed. eCFR does respond, and better than hoped:
 *
 *   GET /api/versioner/v1/versions/title-7.json?part=319
 *   → { content_versions: [ { identifier: "319.56-12", amendment_date: "…",
 *                             substantive: true, removed: false, … }, … ] }
 *
 * Two things that matter. Identifiers are SECTION level, and hyphenated
 * sections appear exactly as our citations write them ("319.56-12"), so no
 * mapping is needed. And `substantive` separates real amendments from editorial
 * corrections — 62 of 598 records for part 319 are non-substantive. Ignoring
 * those is the difference between a signal and a nuisance.
 */

/** A citation broken into the parts the eCFR API indexes by. */
export type CfrRef = {
  title: number;
  part: string;
  /** Section identifier as eCFR writes it, e.g. "319.56-12". Null = whole part. */
  section: string | null;
};

/**
 * Parse "7 CFR 319.56-12" and its common variants.
 *
 * Deliberately strict. A citation this cannot parse is left alone and reported,
 * rather than guessed at — polling the wrong part would produce either silence
 * about a rule that did change, or noise about one that did not, and both
 * undermine the signal.
 */
export function parseCfrCitation(citation: string): CfrRef | null {
  if (!citation) return null;

  // "7 CFR 319.56-12", "7 C.F.R. § 319.56-12", "7 CFR Part 319"
  const match = citation
    .replace(/§/g, " ")
    .replace(/C\.F\.R\./gi, "CFR")
    .match(/(\d{1,2})\s*CFR\s*(?:part\s*)?(\d+)(?:\.(\d+(?:-\d+)?))?/i);

  if (!match) return null;

  const [, titleRaw, partRaw, sectionSuffix] = match;
  const title = Number(titleRaw);
  if (!Number.isFinite(title) || title < 1 || title > 50) return null;

  return {
    title,
    part: partRaw,
    section: sectionSuffix ? `${partRaw}.${sectionSuffix}` : null,
  };
}

export type EcfrVersion = {
  identifier: string;
  amendment_date: string;
  substantive: boolean;
  removed: boolean;
};

export function ecfrVersionsUrl(ref: CfrRef): string {
  return `https://www.ecfr.gov/api/versioner/v1/versions/title-${ref.title}.json?part=${ref.part}`;
}

export type ChangeVerdict =
  | { changed: false }
  | { changed: true; amendedOn: string; removed: boolean };

/**
 * Has the cited law moved since we last verified the rule?
 *
 * `since` is the rule's reviewed_at — the date a person actually read the
 * source. Comparing against anything else would either re-raise settled rules
 * or miss changes made between review and now.
 *
 * Non-substantive versions are ignored, and a section-level citation only ever
 * matches its own section. A rule citing the whole part is compared against
 * every section in it, which is correct: the rule claims to rest on all of it.
 */
export function detectChange(
  ref: CfrRef,
  versions: EcfrVersion[],
  since: string
): ChangeVerdict {
  const sinceDay = since.slice(0, 10);
  let latest: EcfrVersion | null = null;

  for (const version of versions) {
    if (!version.substantive) continue;
    if (ref.section && version.identifier !== ref.section) continue;
    if (version.amendment_date.slice(0, 10) <= sinceDay) continue;

    if (!latest || version.amendment_date > latest.amendment_date) latest = version;
  }

  return latest
    ? { changed: true, amendedOn: latest.amendment_date.slice(0, 10), removed: latest.removed }
    : { changed: false };
}
