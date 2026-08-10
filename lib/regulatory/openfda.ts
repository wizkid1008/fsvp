/**
 * openFDA food enforcement (recall) client.
 *
 * https://api.fda.gov/food/enforcement.json — open REST, no credentials
 * required. An api.data.gov key raises the ceiling from 1,000 requests per day
 * per IP to 120,000 per day per key; we send one when OPENFDA_API_KEY is set and
 * work without it when it is not, because a missing key should degrade the
 * refresh rate rather than break the feature.
 *
 * Field names below were taken from the endpoint's own searchable-fields
 * listing rather than from memory. `center_classification_date` in particular
 * is easy to mistype as `center_classified_date`, and openFDA answers an
 * unknown field with an empty result set rather than an error — which would
 * look exactly like a supplier having a clean history.
 */

import type { RegulatoryEventType } from "./sources";

const ENDPOINT = "https://api.fda.gov/food/enforcement.json";

/** openFDA rejects limits above 1000 and skips beyond 25000. */
const PAGE_SIZE = 1000;
const MAX_SKIP = 25_000;

export type FoodEnforcementRecord = {
  recall_number?: string;
  event_id?: string;
  status?: string;
  classification?: string;
  product_type?: string;
  recalling_firm?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  voluntary_mandated?: string;
  initial_firm_notification?: string;
  distribution_pattern?: string;
  product_description?: string;
  product_quantity?: string;
  code_info?: string;
  more_code_info?: string;
  reason_for_recall?: string;
  recall_initiation_date?: string;
  center_classification_date?: string;
  report_date?: string;
  termination_date?: string;
};

type OpenFdaResponse = {
  meta?: { results?: { skip: number; limit: number; total: number } };
  results?: FoodEnforcementRecord[];
  error?: { code: string; message: string };
};

export type FetchWindow = {
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  /** Inclusive, YYYY-MM-DD. */
  to: string;
};

export class OpenFdaError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "OpenFdaError";
  }
}

function compactDate(iso: string): string {
  return iso.replace(/-/g, "");
}

/**
 * Pulls every food enforcement record reported inside the window.
 *
 * Paged rather than streamed because the caller needs a definite count to write
 * on the ingest run, and because a partially-consumed generator would leave a
 * run row saying "running" forever.
 *
 * A 404 from openFDA means "no matching records", not a broken request — the
 * API uses it for empty result sets. Treating it as an error would turn a
 * legitimately quiet week into a failed ingest.
 */
export async function fetchFoodEnforcement(
  window: FetchWindow,
  opts: { apiKey?: string; maxRecords?: number; fetchImpl?: typeof fetch } = {}
): Promise<FoodEnforcementRecord[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const maxRecords = opts.maxRecords ?? MAX_SKIP;
  const out: FoodEnforcementRecord[] = [];

  let skip = 0;

  while (skip < Math.min(maxRecords, MAX_SKIP)) {
    const params = new URLSearchParams({
      search: `report_date:[${compactDate(window.from)}+TO+${compactDate(window.to)}]`,
      limit: String(Math.min(PAGE_SIZE, maxRecords - out.length)),
      skip: String(skip),
    });
    if (opts.apiKey) params.set("api_key", opts.apiKey);

    // URLSearchParams percent-encodes the '+' that openFDA's range syntax
    // requires as a literal separator, so it is restored after encoding.
    const url = `${ENDPOINT}?${params.toString().replace(/%2B/g, "+")}`;

    const res = await doFetch(url, { headers: { accept: "application/json" } });

    if (res.status === 404) break; // openFDA's "no results"
    if (res.status === 429) {
      throw new OpenFdaError(
        "openFDA rate limit reached. Set OPENFDA_API_KEY to raise the daily ceiling from 1,000 to 120,000 requests.",
        429
      );
    }
    if (!res.ok) {
      throw new OpenFdaError(`openFDA returned HTTP ${res.status}.`, res.status);
    }

    const body = (await res.json()) as OpenFdaResponse;
    if (body.error) throw new OpenFdaError(body.error.message);

    const batch = body.results ?? [];
    out.push(...batch);

    const total = body.meta?.results?.total ?? out.length;
    skip += batch.length;

    if (batch.length === 0 || out.length >= total || out.length >= maxRecords) break;
  }

  return out;
}

// ── Normalisation into our event shape ──────────────────────────────────────

export type NormalisedEvent = {
  source: "fda_food_enforcement";
  source_ref: string;
  event_type: RegulatoryEventType;
  event_date: string | null;
  firm_name: string | null;
  firm_fei: null;
  firm_country: string | null;
  firm_address: string | null;
  product_description: string | null;
  summary: string;
  classification: string | null;
  detail_json: FoodEnforcementRecord;
  source_url: string;
};

/** openFDA dates are YYYYMMDD strings; Postgres wants YYYY-MM-DD. */
function toIsoDate(compact: string | undefined): string | null {
  if (!compact || !/^\d{8}$/.test(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function joinAddress(r: FoodEnforcementRecord): string | null {
  const parts = [r.address_1, r.address_2, r.city, r.state, r.postal_code].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * A one-line summary for the review queue. The reviewer is deciding "is this
 * our supplier", so the firm and the reason lead; the recall number is
 * bookkeeping and goes last.
 */
function summarise(r: FoodEnforcementRecord): string {
  const firm = r.recalling_firm?.trim() || "Unnamed firm";
  const reason = r.reason_for_recall?.trim().replace(/\s+/g, " ") ?? "";
  const short = reason.length > 180 ? `${reason.slice(0, 177)}…` : reason;
  const cls = r.classification ? ` (${r.classification})` : "";
  return short ? `${firm}${cls}: ${short}` : `${firm}${cls}: recall recorded`;
}

export function normaliseEnforcement(r: FoodEnforcementRecord): NormalisedEvent | null {
  // Without a recall number there is no stable dedupe key, so re-running the
  // ingest would keep inserting the same event. Dropping it is better than
  // accumulating duplicates in a compliance record.
  const ref = r.recall_number?.trim();
  if (!ref) return null;

  return {
    source: "fda_food_enforcement",
    source_ref: ref,
    event_type: "recall",
    // report_date is when FDA published, which is the date we can defend as
    // "when this became known". recall_initiation_date is the firm's action and
    // is kept in detail_json for anyone who needs it.
    event_date: toIsoDate(r.report_date) ?? toIsoDate(r.recall_initiation_date),
    firm_name: r.recalling_firm?.trim() || null,
    firm_fei: null, // openFDA enforcement carries no FEI.
    firm_country: r.country?.trim() || null,
    firm_address: joinAddress(r),
    product_description: r.product_description?.trim() || null,
    summary: summarise(r),
    classification: r.classification?.trim() || null,
    detail_json: r,
    source_url: `https://api.fda.gov/food/enforcement.json?search=recall_number:"${encodeURIComponent(ref)}"`,
  };
}
