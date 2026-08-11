/**
 * Deciding whether an FDA record is about one of our suppliers.
 *
 * This is the dangerous part of regulatory intelligence, so it is worth being
 * explicit about why it is hard. FDA's Data Dashboard identifies firms by FEI
 * number. We hold company names, a country, and for some suppliers an FDA food
 * facility registration number — which is a DIFFERENT identifier from the FEI
 * and cannot be joined against it. openFDA's enforcement data carries no firm
 * identifier at all, only a name and address.
 *
 * So in most cases the only available join is name plus country, and company
 * names are not unique, not consistently spelled, and not stable across
 * datasets. "Grupo Agrícola del Valle S.A. de C.V." and "GRUPO AGRICOLA DEL
 * VALLE SA DE CV" are the same firm; "Sun Foods Ltd" in Kenya and "Sun Foods
 * Inc" in Vietnam are not.
 *
 * The consequence of getting it wrong is not a bad search result. It is
 * attributing another company's recall to a supplier, feeding it into their
 * compliance history, and degrading their standing on our say-so. So:
 *
 *   1. Nothing here attributes anything. It PROPOSES, with a written rationale,
 *      and a person confirms. See 009_regulatory_intelligence.sql.
 *   2. A country mismatch is disqualifying, not merely a penalty. A same-named
 *      firm in another country is a different firm often enough that proposing
 *      it wastes a reviewer's attention, which is the scarce resource here.
 *   3. Below the similarity floor we propose nothing at all. A review queue
 *      full of noise is a review queue nobody reads, and that failure mode ends
 *      with real findings being rubber-stamped past.
 *
 * Pure functions with no database access, so the judgement can be tested
 * directly — see matching.test.ts.
 */

export type MatchMethod = "fei_exact" | "name_country_exact" | "name_country_fuzzy" | "manual";

export type MatchCandidate = {
  method: MatchMethod;
  /** 0–1. Ordering for the reviewer's attention, never an automatic decision. */
  confidence: number;
  /** What was compared and what was found, in words a reviewer can check. */
  rationale: string;
};

/** The fields of ours a match is made against. */
export type MatchableEntity = {
  id: string;
  name: string;
  /** ISO 3166-1 alpha-2, as stored on suppliers.country. */
  countryCode: string | null;
  feiNumber?: string | null;
  /** Cached normaliseFirmName(name). Set by prepareEntities; never required. */
  normalisedName?: string;
};

/** The fields of FDA's a match is made against. */
export type MatchableEvent = {
  firmName: string | null;
  /** As FDA publishes it: usually a full country name. */
  firmCountry: string | null;
  firmFei?: string | null;
  /** Cached normaliseFirmName(firmName). Optional, same as above. */
  normalisedFirmName?: string;
};

/**
 * Normalises entity names once, ahead of matching.
 *
 * Without this the same supplier name is re-normalised for every FDA event in
 * the batch — tens of thousands of redundant regex passes on a full ingest,
 * which is precisely what exhausted the Cloudflare Worker CPU budget.
 */
export function prepareEntities(entities: MatchableEntity[]): MatchableEntity[] {
  return entities.map((e) => ({ ...e, normalisedName: normaliseFirmName(e.name) }));
}

/** Resolves between our country codes and FDA's country names. */
export type CountryLookup = {
  /** 'MX' → 'Mexico' */
  nameForCode: (code: string) => string | null;
};

// ── Name normalisation ──────────────────────────────────────────────────────

/**
 * Corporate form suffixes, which carry no identifying information and differ
 * between datasets for the same firm. Stripped before comparison so
 * "Foo S.A. de C.V." and "Foo SA DE CV" reduce to the same string.
 *
 * Ordered longest-first so multi-word forms are removed before their fragments
 * ("SA DE CV" before "SA").
 */
const CORPORATE_SUFFIXES = [
  "SA DE CV", "S A DE C V", "SOCIEDAD ANONIMA", "SP Z OO", "PTY LTD",
  "PRIVATE LIMITED", "PVT LTD", "CO LTD", "COMPANY LIMITED", "LIMITED LIABILITY COMPANY",
  "INCORPORATED", "CORPORATION", "COMPANY", "LIMITED",
  "GMBH", "AKTIENGESELLSCHAFT", "SARL", "SRL", "SPA", "SAS", "BVBA",
  "LLC", "LTDA", "LTD", "INC", "CORP", "PLC", "NV", "BV", "AG", "AS", "OY", "AB",
  "SA", "SL", "KFT", "DOO", "PT", "CV", "CO",
];

/**
 * Punctuation and diacritics differ between datasets; neither identifies a
 * firm. The range is the Unicode combining diacritical marks block, written as
 * escapes rather than literal marks so the source stays legible and cannot be
 * mangled by an editor normalising the file.
 */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Reduces a company name to its identifying core: uppercase, no accents, no
 * punctuation, no corporate form.
 *
 * If stripping suffixes would empty the name the un-stripped form is kept — a
 * firm genuinely called "Limited" should not normalise to nothing and then
 * match everything.
 */
export function normaliseFirmName(raw: string | null | undefined): string {
  if (!raw) return "";

  let s = stripDiacritics(raw)
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!s) return "";

  const beforeSuffixStrip = s;
  for (const suffix of CORPORATE_SUFFIXES) {
    // Only as a trailing form. "Corporation" inside "Corporation Street Foods"
    // is part of the name.
    const re = new RegExp(`\\s+${suffix.replace(/ /g, "\\s+")}$`);
    let previous: string;
    do {
      previous = s;
      s = s.replace(re, "");
    } while (s !== previous);
  }

  s = s.trim();
  return s || beforeSuffixStrip;
}

// ── Similarity ──────────────────────────────────────────────────────────────

function bigrams(s: string): Map<string, number> {
  const grams = new Map<string, number>();
  const clean = s.replace(/\s/g, "");
  for (let i = 0; i < clean.length - 1; i++) {
    const g = clean.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

/**
 * Sørensen–Dice coefficient over character bigrams, 0–1.
 *
 * Chosen over edit distance because it tolerates word reordering and length
 * differences — the two things that actually differ between a name we hold and
 * a name FDA published — while still punishing genuinely different words.
 */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.size === 0 || gb.size === 0) return 0;

  let overlap = 0;
  let totalA = 0;
  let totalB = 0;
  for (const n of ga.values()) totalA += n;
  for (const n of gb.values()) totalB += n;

  for (const [gram, countA] of ga) {
    const countB = gb.get(gram);
    if (countB) overlap += Math.min(countA, countB);
  }

  return (2 * overlap) / (totalA + totalB);
}

// ── Thresholds ──────────────────────────────────────────────────────────────

/**
 * Below this, nothing is proposed. Tuned to keep the queue readable rather than
 * exhaustive: a missed match costs a manual search, a flood of weak ones costs
 * the reviewer's trust in the whole queue.
 */
export const FUZZY_FLOOR = 0.82;

/**
 * Short names carry too little signal for fuzzy comparison — at four
 * characters, Dice similarity between unrelated words is high by accident.
 * Short names must match exactly or not at all.
 */
export const MIN_FUZZY_LENGTH = 8;

// ── Country ─────────────────────────────────────────────────────────────────

/**
 * Whether our country code and FDA's country string describe the same place.
 *
 * FDA publishes names ("Mexico"), we store codes ("MX"), so the comparison goes
 * through the countries reference table rather than a second hardcoded list
 * that could drift from it.
 */
export function countryMatches(
  countryCode: string | null,
  fdaCountry: string | null,
  lookup: CountryLookup
): boolean {
  if (!countryCode || !fdaCountry) return false;

  const code = countryCode.trim().toUpperCase();
  const fda = stripDiacritics(fdaCountry).trim().toUpperCase();

  // Some datasets carry the code directly.
  if (code === fda) return true;

  const name = lookup.nameForCode(code);
  if (!name) return false;

  const canonical = stripDiacritics(name).toUpperCase();
  if (canonical === fda) return true;

  // The reference table writes "Bosnia & Herzegovina" where FDA writes
  // "Bosnia and Herzegovina"; normalise the connector both ways.
  return canonical.replace(/&/g, "AND").replace(/\s+/g, " ") ===
         fda.replace(/&/g, "AND").replace(/\s+/g, " ");
}

// ── The proposal ────────────────────────────────────────────────────────────

/**
 * Proposes a link between one of our entities and one FDA event, or returns
 * null when there is no defensible reason to put it in front of a reviewer.
 *
 * Confidence never reaches 1.0 for a name-based match, however good the string
 * looks, because a name is not an identifier. Only FEI equality earns that, and
 * even it goes to a person for confirmation.
 */
export function proposeMatch(
  entity: MatchableEntity,
  event: MatchableEvent,
  lookup: CountryLookup
): MatchCandidate | null {
  // ── FEI: the only exact join FDA offers ──────────────────────────────────
  const ourFei = entity.feiNumber?.trim();
  const theirFei = event.firmFei?.trim();
  if (ourFei && theirFei && ourFei === theirFei) {
    return {
      method: "fei_exact",
      confidence: 1,
      rationale:
        `FDA Establishment Identifier ${theirFei} on the FDA record is the same number recorded ` +
        `for ${entity.name}. FEI is FDA's own firm identifier, so this is an exact match rather ` +
        `than a resemblance.`,
    };
  }

  // ── Country is a gate, not a factor ──────────────────────────────────────
  // Checked BEFORE normalising names, not after. Normalisation strips
  // diacritics, uppercases, and walks ~30 corporate-suffix regexes; doing that
  // for every entity against every event before discarding most of them on
  // country is what made a full ingest exceed the Worker CPU limit. The gate is
  // a handful of string compares and eliminates the overwhelming majority.
  if (!countryMatches(entity.countryCode, event.firmCountry, lookup)) return null;

  // Precomputed by proposeMatches where available — normalising one entity name
  // once per ingest rather than once per event is the difference between O(n)
  // and O(n × m) normalisations.
  const ourName = entity.normalisedName ?? normaliseFirmName(entity.name);
  const theirName = event.normalisedFirmName ?? normaliseFirmName(event.firmName);
  if (!ourName || !theirName) return null;

  const countryName = entity.countryCode ? lookup.nameForCode(entity.countryCode) : null;
  const where = countryName ?? entity.countryCode ?? "the same country";

  if (ourName === theirName) {
    return {
      method: "name_country_exact",
      confidence: 0.9,
      rationale:
        `"${event.firmName}" matches "${entity.name}" exactly once corporate form and punctuation ` +
        `are set aside (both reduce to "${ourName}"), and both are in ${where}. Company names are ` +
        `not unique identifiers, so please confirm this is the same firm.`,
    };
  }

  if (ourName.length < MIN_FUZZY_LENGTH || theirName.length < MIN_FUZZY_LENGTH) return null;

  const similarity = nameSimilarity(ourName, theirName);
  if (similarity < FUZZY_FLOOR) return null;

  return {
    method: "name_country_fuzzy",
    // Mapped into 0.5–0.85 so a fuzzy match never outranks an exact one in the
    // queue, however close the strings happen to be.
    confidence: Math.round((0.5 + (similarity - FUZZY_FLOOR) * (0.35 / (1 - FUZZY_FLOOR))) * 1000) / 1000,
    rationale:
      `"${event.firmName}" resembles "${entity.name}" (${Math.round(similarity * 100)}% similar ` +
      `after normalising to "${theirName}" and "${ourName}"), and both are in ${where}. This is a ` +
      `resemblance, not an identification — check the address and product before confirming.`,
  };
}

/**
 * Proposes matches for one event across many of our entities, keeping only the
 * strongest per entity.
 *
 * Deliberately returns every qualifying entity rather than a single best guess:
 * two of our suppliers may genuinely share a name, and picking one for the
 * reviewer would hide the ambiguity that makes the decision worth a human.
 */
export function proposeMatches(
  entities: MatchableEntity[],
  event: MatchableEvent,
  lookup: CountryLookup
): Array<{ entity: MatchableEntity; candidate: MatchCandidate }> {
  const out: Array<{ entity: MatchableEntity; candidate: MatchCandidate }> = [];
  for (const entity of entities) {
    const candidate = proposeMatch(entity, event, lookup);
    if (candidate) out.push({ entity, candidate });
  }
  return out.sort((a, b) => b.candidate.confidence - a.candidate.confidence);
}
