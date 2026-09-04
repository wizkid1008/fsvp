/**
 * FDA Product Code Builder (PCB) API client.
 *
 * https://www.accessdata.fda.gov/rest/pcbapi/v1 — the same shape of deal as the
 * Data Dashboard API next door: free, but credentialed through FDA's OII
 * Unified Logon, with `Authorization-User` and `Authorization-Key` headers.
 * Keys are issued per application, so they are read from their own environment
 * variables rather than borrowed from FDA_DATADASHBOARD_*.
 *
 * WHAT THIS IS FOR, AND WHAT IT CANNOT DO
 *
 * A product code is not an attribute of a commodity. FDA's own worked example
 * is 38BEE27, concentrated canned tomato soup, where subclass `E` means METAL
 * (the can) and PIC `E` means COMMERCIALLY STERILE (the retort). The same soup
 * in glass is a different code. FDA states plainly that determining a code
 * needs "the label, the processing information, intended use of product, the
 * container type" — none of which the commodity taxonomy holds.
 *
 * So this client is deliberately NOT a way to backfill
 * `commodities.fda_product_code` from a commodity name. It exists to:
 *
 *   1. read FDA's reference tables (industry / class / subclass / PIC /
 *      product), which are taxonomy facts and make no regulatory claim, and
 *   2. VERIFY a code somebody already has — from a broker, from an ACE entry —
 *      which is the only direction that carries a warrant.
 *
 * Deriving a code and presenting it as FDA's answer would be the same error
 * migration 012 was written to prevent, one table over.
 *
 * TWO TRAPS IN THIS API, BOTH LOAD-BEARING
 *
 * 1. HTTP 403 AND 404 ARE NOT WHAT THEY LOOK LIKE. On /productcode/{code},
 *    FDA's spec defines 403 as "Valid product code" and 404 as "Invalid
 *    product code". Reading them the ordinary way — forbidden, not found —
 *    inverts the answer and reports a credential failure as a bad code.
 *
 * 2. HTTP 400 MEANS "Success". The spec says so on every endpoint, which
 *    matches what datadashboard.ts already learned the hard way about this
 *    family of FDA services. So success is judged by whether a RESULT came
 *    back, never by the status code.
 *
 * Responses are cached server-side, so every request carries a unique
 * `signature` query parameter — FDA's own Python example does the same, and
 * without it a 401 from a bad key is replayed to you after the key is fixed.
 */

const BASE = "https://www.accessdata.fda.gov/rest/pcbapi/v1";

export type PcbCredentials = { user: string; key: string };

export class PcbError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** The APIRETURNCODE FDA put in the body, when it sent one. */
    readonly apiReturnCode?: number
  ) {
    super(message);
    this.name = "PcbError";
  }
}

/**
 * Reads credentials from the environment.
 *
 * Both or neither, for the same reason as the Data Dashboard pair: a
 * half-configured credential fails at request time, and a swallowed auth
 * failure is indistinguishable from FDA having nothing to say.
 */
export function pcbCredentialsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): PcbCredentials | null {
  const user = env.FDA_PCB_USER?.trim();
  const key = env.FDA_PCB_KEY?.trim();
  if (!user || !key) return null;
  return { user, key };
}

// ── Response envelope ───────────────────────────────────────────────────────

/**
 * FDA returns a columnar result: names in COLUMNS, values in DATA as parallel
 * arrays. Nothing guarantees column ORDER between releases, so rows are zipped
 * by name and never read positionally.
 */
export type ColumnarResult = {
  COLUMNS?: string[];
  /**
   * Cells are `unknown`, not `string | null`, because FDA sends whatever the
   * underlying column holds — numeric ids arrive as JSON numbers, not quoted.
   * Declaring them strings was a claim about FDA's JSON that nothing checked,
   * and it held only because /industry happens to return everything quoted.
   */
  DATA?: unknown[][];
};

export type ParentResult = {
  MESSAGE?: string;
  RESULTCOUNT?: number | string;
  APIRETURNCODE?: number | string;
  RESULT?: ColumnarResult;
};

export type PcbRow = Record<string, string | null>;

/**
 * One cell, as a string or null.
 *
 * FDA does not quote everything. A subclass or PIC id comes back as a JSON
 * number while its code and description come back as strings, in the same row.
 * Every consumer of PcbRow treats values as text — .trim(), .test(), regex
 * matching — so a number reaching them crashed the request with "f.trim is not
 * a function", which as an unhandled edge error surfaced as a bare 500.
 *
 * Coercing here rather than at each call site is what makes PcbRow's type
 * honest: one conversion at the boundary, and nothing downstream has to know
 * FDA is inconsistent. Objects and arrays become null — a nested value is not
 * a cell, and "[object Object]" would be worse than admitting there is nothing
 * readable there.
 */
function cell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** COLUMNS + DATA → row objects. Missing cells become null, not undefined. */
export function zipColumns(result: ColumnarResult | null | undefined): PcbRow[] {
  const columns = result?.COLUMNS;
  const data = result?.DATA;
  if (!Array.isArray(columns) || !Array.isArray(data)) return [];

  return data.map((row) => {
    const out: PcbRow = {};
    columns.forEach((column, i) => {
      out[column] = Array.isArray(row) ? cell(row[i]) : null;
    });
    return out;
  });
}

/**
 * The response codes FDA documents WITH text. Codes the spec lists but leaves
 * undescribed (409 on /subclass/{id}, 412 on /product/{id}, 413 on /pic/{id})
 * are deliberately absent — a guessed meaning in an error message is worse than
 * an honest "FDA returned 412".
 */
const CODE_MEANING: Record<number, string> = {
  401: "Authorization has been denied for this request.",
  402: "That is not a valid length for a product code.",
  405: "An industry id is required to search by partial code.",
  406: "The industry id must be numeric.",
  407: "The search payload was missing.",
  410: "FDA rejected the API key — check FDA_PCB_KEY is current.",
  411: "FDA rejected the API user — FDA_PCB_USER must be the exact email FDA approved.",
};

/** 401/410/411 all mean the credential is wrong, and each says how. */
function isAuthCode(code: number): boolean {
  return code === 401 || code === 410 || code === 411;
}

/**
 * Every response is cached by URL, so each request needs a unique signature.
 * Milliseconds plus a counter rather than FDA's seconds: two calls inside one
 * second are ordinary here (five reference tables pulled in a loop), and a
 * collision would serve the first response to the second call.
 */
let signatureCounter = 0;
function nextSignature(): string {
  signatureCounter = (signatureCounter + 1) % 1_000_000;
  return `${Date.now()}-${signatureCounter}`;
}

function pcbHeaders(creds: PcbCredentials, contentType?: string): Record<string, string> {
  return {
    "Authorization-User": creds.user,
    "Authorization-Key": creds.key,
    accept: "application/json",
    // FDA's own example sets one, and accessdata.fda.gov sits behind a filter
    // that has been observed 404-ing unadorned automated clients.
    "User-Agent": "FSVP-Compliance-Platform/1.0 (+FDA PCB API client)",
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

function numericCode(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/**
 * One request, returning the parsed envelope and the codes that came with it.
 *
 * It does NOT decide success — callers do, because the two endpoint families
 * disagree about what success looks like. Table endpoints answer with a RESULT;
 * /productcode/{code} answers with nothing but a code, and there the code IS
 * the answer.
 */
async function pcbRequest(
  path: string,
  creds: PcbCredentials,
  opts: { method?: "GET" | "POST"; form?: Record<string, string>; fetchImpl?: typeof fetch } = {}
): Promise<{ body: ParentResult; status: number; apiReturnCode?: number }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const method = opts.method ?? "GET";
  const separator = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${separator}signature=${nextSignature()}`;

  const res = await doFetch(url, {
    method,
    headers: pcbHeaders(creds, opts.form ? "application/x-www-form-urlencoded" : undefined),
    ...(opts.form ? { body: new URLSearchParams(opts.form).toString() } : {}),
  });

  // A non-JSON body means the filter in front of the API answered, not the API.
  let body: ParentResult = {};
  try {
    body = (await res.json()) as ParentResult;
  } catch {
    if (isAuthCode(res.status)) {
      throw new PcbError(CODE_MEANING[res.status] ?? "FDA rejected the credentials.", res.status);
    }
    throw new PcbError(
      `FDA PCB returned HTTP ${res.status} with a body that was not JSON. This usually means the ` +
      `request never reached the API — check the host and that a User-Agent is being sent.`,
      res.status
    );
  }

  return { body, status: res.status, apiReturnCode: numericCode(body.APIRETURNCODE) };
}

/**
 * A table endpoint: succeeds when rows come back, whatever the status says.
 *
 * Auth failures are raised rather than returned as an empty table, because an
 * empty reference table and a rejected key look identical downstream and only
 * one of them should stop an ingest.
 */
async function fetchTable(
  path: string,
  creds: PcbCredentials,
  opts: { method?: "GET" | "POST"; form?: Record<string, string>; fetchImpl?: typeof fetch } = {}
): Promise<PcbRow[]> {
  const { body, status, apiReturnCode } = await pcbRequest(path, creds, opts);

  // Either channel may carry the real code; FDA is not consistent about which.
  const codes = [apiReturnCode, status].filter((c): c is number => typeof c === "number");
  const auth = codes.find(isAuthCode);
  if (auth !== undefined) throw new PcbError(CODE_MEANING[auth], status, apiReturnCode);

  if (!body.RESULT || !Array.isArray(body.RESULT.COLUMNS)) {
    const explained = codes.map((c) => CODE_MEANING[c]).find(Boolean);
    throw new PcbError(
      explained ??
        `FDA PCB returned no result set for ${path} (HTTP ${status}, APIRETURNCODE ` +
        `${apiReturnCode ?? "none"}, message ${JSON.stringify(body.MESSAGE ?? null)}).`,
      status,
      apiReturnCode
    );
  }

  return zipColumns(body.RESULT);
}

// ── Reference tables ────────────────────────────────────────────────────────
// Taxonomy facts, not regulatory claims — safe to ingest, by the same argument
// migration 018 makes for the commodity taxonomy itself.

export const listIndustries = (c: PcbCredentials, o?: { fetchImpl?: typeof fetch }) =>
  fetchTable("/industry", c, o);

export const listClasses = (c: PcbCredentials, o?: { fetchImpl?: typeof fetch }) =>
  fetchTable("/class", c, o);

export const listSubclasses = (c: PcbCredentials, o?: { fetchImpl?: typeof fetch }) =>
  fetchTable("/subclass", c, o);

export const listPics = (c: PcbCredentials, o?: { fetchImpl?: typeof fetch }) =>
  fetchTable("/pic", c, o);

export const listProducts = (c: PcbCredentials, o?: { fetchImpl?: typeof fetch }) =>
  fetchTable("/product", c, o);

/**
 * Industry-scoped variants — far smaller pulls when the industry is known.
 *
 * `id` IS A STRING, AND ZERO PADDING IS PART OF IT.
 *
 * FDA's own /industry response gives INDID as "02", "03", "09" — a padded
 * two-character code, not a number that happens to be small. These helpers
 * previously took `number`, so callers reached for Number(industry) and sent
 * /industrysubclass/2 for the industry FDA calls 02. Both dropdowns came back
 * empty, and the conclusion drawn at the time was that FDA's industry-scoped
 * endpoints "are not dependable" — when they had never been asked for an
 * industry that exists.
 *
 * The id is now passed through exactly as FDA gave it. That is right whichever
 * way FDA parses it: "02" still reads as 2 if it coerces, and matches the
 * string if it does not. Number() can only ever destroy information here.
 */
export type IndustryId = string | number;

export const listClassesForIndustry = (id: IndustryId, c: PcbCredentials, o?: { fetchImpl?: typeof fetch }) =>
  fetchTable(`/industryclass/${encodeURIComponent(String(id))}`, c, o);

export const listSubclassesForIndustry = (id: IndustryId, c: PcbCredentials, o?: { fetchImpl?: typeof fetch }) =>
  fetchTable(`/industrysubclass/${encodeURIComponent(String(id))}`, c, o);

export const listPicsForIndustry = (id: IndustryId, c: PcbCredentials, o?: { fetchImpl?: typeof fetch }) =>
  fetchTable(`/industrypic/${encodeURIComponent(String(id))}`, c, o);

export const listProductsForIndustry = (id: IndustryId, c: PcbCredentials, o?: { fetchImpl?: typeof fetch }) =>
  fetchTable(`/industryproduct/${encodeURIComponent(String(id))}`, c, o);

export const listProductCodesForIndustry = (id: IndustryId, c: PcbCredentials, o?: { fetchImpl?: typeof fetch }) =>
  fetchTable(`/productcodeindustry/${encodeURIComponent(String(id))}`, c, o);

// ── Search ──────────────────────────────────────────────────────────────────

/** Characters that break the GET form of name search, per FDA's own note. */
const NEEDS_POST = /[%&/]/;

/**
 * Search products by name.
 *
 * FDA publishes two endpoints for this because `%`, `&` and `/` appear in real
 * product names ("Lamb (3% or less)") and break the path-parameter form. The
 * choice is made here so callers never have to know.
 */
export function searchProductsByName(
  name: string,
  creds: PcbCredentials,
  opts: { fetchImpl?: typeof fetch } = {}
): Promise<PcbRow[]> {
  const term = name.trim();
  if (!term) return Promise.resolve([]);

  if (NEEDS_POST.test(term)) {
    return fetchTable("/product/name", creds, {
      method: "POST",
      form: { payload: term },
      fetchImpl: opts.fetchImpl,
    });
  }
  return fetchTable(`/product/name/${encodeURIComponent(term)}`, creds, opts);
}

/** Product codes matching a partial composition. Industry is mandatory. */
export function searchPartialCodes(
  q: { industry: IndustryId; class?: string; subclass?: string; pic?: string; group?: string },
  creds: PcbCredentials,
  opts: { fetchImpl?: typeof fetch } = {}
): Promise<PcbRow[]> {
  const params = new URLSearchParams({ industry: String(q.industry) });
  if (q.class) params.set("class", q.class);
  if (q.subclass) params.set("subclass", q.subclass);
  if (q.pic) params.set("pic", q.pic);
  if (q.group) params.set("group", q.group);
  return fetchTable(`/partialcode?${params.toString()}`, creds, opts);
}

// ── Verification ────────────────────────────────────────────────────────────

export type CodeVerification =
  | { status: "valid"; code: string; message: string | null }
  | { status: "invalid"; code: string; message: string | null }
  | { status: "bad_length"; code: string; message: string | null };

/**
 * Asks FDA whether a product code is real.
 *
 * THE INVERSION LIVES HERE. For this endpoint FDA defines:
 *
 *     402 → invalid length      403 → VALID CODE      404 → INVALID CODE
 *
 * 403 is not "forbidden" and 404 is not "missing route". Credential failures
 * arrive as 401/410/411 instead and are thrown, so a caller can never confuse
 * "your key is wrong" with "your code is wrong" — which, on a screen telling an
 * importer their broker's code is bogus, is the difference that matters.
 */
export async function verifyProductCode(
  code: string,
  creds: PcbCredentials,
  opts: { fetchImpl?: typeof fetch } = {}
): Promise<CodeVerification> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) throw new PcbError("Give a product code to verify.");

  const { body, status, apiReturnCode } = await pcbRequest(
    `/productcode/${encodeURIComponent(trimmed)}`,
    creds,
    opts
  );

  const message = typeof body.MESSAGE === "string" ? body.MESSAGE : null;
  const codes = [apiReturnCode, status].filter((c): c is number => typeof c === "number");

  const auth = codes.find(isAuthCode);
  if (auth !== undefined) throw new PcbError(CODE_MEANING[auth], status, apiReturnCode);

  if (codes.includes(403)) return { status: "valid", code: trimmed, message };
  if (codes.includes(404)) return { status: "invalid", code: trimmed, message };
  if (codes.includes(402)) return { status: "bad_length", code: trimmed, message };

  throw new PcbError(
    `FDA PCB did not say whether ${trimmed} is a valid product code (HTTP ${status}, ` +
    `APIRETURNCODE ${apiReturnCode ?? "none"}, message ${JSON.stringify(message)}). ` +
    `Treating an unrecognised answer as "valid" would put an unchecked code on an entry.`,
    status,
    apiReturnCode
  );
}

// ── Local decomposition ─────────────────────────────────────────────────────

export type ProductCodeParts = {
  /** Two digits. The broadest grouping — "38" is soup. */
  industry: string;
  /** One letter, meaningful only within its industry. */
  class: string;
  /** Container material. Null when hyphenated or absent. */
  subclass: string | null;
  /** Process, storage or dosage form. Null when hyphenated or absent. */
  pic: string | null;
  /** Two characters identifying the product within industry + class. */
  product: string;
};

export type Decomposition =
  | { status: "parsed"; parts: ProductCodeParts }
  /** Six characters: one middle element is present and it is not sayable which. */
  | { status: "ambiguous"; reason: string; candidates: ProductCodeParts[] }
  | { status: "unparseable"; reason: string };

/**
 * Splits a product code into its five components, without a network call.
 *
 * Worth having separately from verifyProductCode() because the split is what
 * decides where each piece belongs in our schema: industry, class and product
 * describe the COMMODITY, while subclass (container) and PIC (process)
 * describe the goods as packed and belong on the product or the shipment.
 *
 * Fixed positions carry industry (2), class (1) and product (last 2); whatever
 * remains in the middle is subclass and PIC. At seven characters that middle is
 * unambiguous. At six it is one character that could be either, and FDA's
 * format does not say which — so this returns both readings rather than picking
 * one. A guess here would silently file a container code as a process code.
 */
export function decomposeProductCode(code: string): Decomposition {
  const c = code.trim().toUpperCase();

  if (!/^[0-9A-Z-]+$/.test(c)) {
    return { status: "unparseable", reason: "A product code contains only letters, digits and hyphens." };
  }
  if (c.length < 5 || c.length > 7) {
    return {
      status: "unparseable",
      reason: `A product code is five to seven characters; this one is ${c.length}.`,
    };
  }
  if (!/^\d{2}$/.test(c.slice(0, 2))) {
    return { status: "unparseable", reason: "The first two characters must be the numeric industry code." };
  }
  if (!/^[A-Z]$/.test(c[2])) {
    return { status: "unparseable", reason: "The third character must be the alphabetic class code." };
  }

  const industry = c.slice(0, 2);
  const klass = c[2];
  const product = c.slice(-2);
  const middle = c.slice(3, c.length - 2);
  const orNull = (ch: string) => (ch === "-" ? null : ch);

  if (middle.length === 2) {
    return {
      status: "parsed",
      parts: { industry, class: klass, subclass: orNull(middle[0]), pic: orNull(middle[1]), product },
    };
  }

  if (middle.length === 0) {
    return {
      status: "parsed",
      parts: { industry, class: klass, subclass: null, pic: null, product },
    };
  }

  return {
    status: "ambiguous",
    reason:
      `${c} has one middle character (${middle}), which may be either the subclass (container ` +
      `material) or the PIC (process). The code format does not distinguish them at this length — ` +
      `verify it against FDA rather than assuming.`,
    candidates: [
      { industry, class: klass, subclass: orNull(middle), pic: null, product },
      { industry, class: klass, subclass: null, pic: orNull(middle), product },
    ],
  };
}

/**
 * Checks a decomposed code against what the commodity taxonomy says the thing
 * is, and reports every disagreement rather than the first.
 *
 * This is the only cross-check the split makes possible, and it is worth having
 * precisely because the two halves are maintained by different people: an
 * administrator sets the commodity's industry and class, an importer files the
 * full code from their broker. When those disagree, one of them is about a
 * different product — a code filed against the wrong commodity is the entry-line
 * equivalent of a determination made against the wrong commodity.
 *
 * Missing values on either side are not disagreements. Nothing has been
 * asserted, so nothing can conflict; saying otherwise would push people to fill
 * fields with guesses to silence a warning.
 */
export function reconcileWithCommodity(
  parts: ProductCodeParts,
  commodity: { industry?: string | null; class?: string | null; group?: string | null }
): string[] {
  const out: string[] = [];
  const norm = (v: string | null | undefined) => v?.trim().toUpperCase() || null;

  const industry = norm(commodity.industry);
  const klass = norm(commodity.class);
  const group = norm(commodity.group);

  if (industry && industry !== parts.industry) {
    out.push(
      `The code's industry is ${parts.industry}, but this commodity is recorded under FDA ` +
      `industry ${industry}. One of them is about a different product.`
    );
  }
  if (klass && klass !== parts.class) {
    out.push(
      `The code's class is ${parts.class}, but this commodity is recorded under FDA class ${klass}.`
    );
  }
  if (group && group !== parts.product) {
    out.push(
      `The code's product group is ${parts.product}, but this commodity is recorded as FDA ` +
      `product group ${group}.`
    );
  }
  return out;
}
