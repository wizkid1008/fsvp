/**
 * FDA Data Dashboard API (DDAPI) client — import refusals, inspection
 * classifications, and compliance actions.
 *
 * https://api-datadashboard.fda.gov/v1/... — free, but NOT open. Every request
 * needs `Authorization-User` (the email FDA approved) and `Authorization-Key`
 * (the key FDA issued), obtained through FDA's OII Unified Logon. The roadmap
 * originally described this API as having "no gatekeeper", which is why the
 * credential handling here is explicit rather than assumed.
 *
 * The documentation lives at datadashboard.fda.gov/oii/api/ — FDA's own emails
 * link to /ora/api/, which 301-redirects there, so /oii/ is canonical.
 *
 * Every endpoint takes the same POST envelope and returns the same response
 * shape, so one request function serves all three. `sort` and `sortorder` are
 * required by the API, not optional.
 */

import type { RegulatorySourceId } from "./sources";
import { shorten, toIsoDate, type NormalisedEvent } from "./events";

const BASE = "https://api-datadashboard.fda.gov/v1";

/** FDA has not published a page ceiling; 1000 is the largest that behaves. */
const PAGE_SIZE = 1000;
/** Stops a first-ever pull from running until the request budget is gone. */
const DEFAULT_MAX_RECORDS = 20_000;

export type DashboardCredentials = { user: string; key: string };

export class DataDashboardError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "DataDashboardError";
  }
}

type DashboardResponse<T> = {
  statuscode?: number;
  message?: string;
  resultcount?: number;
  result?: T[];
};

export type DashboardQuery = {
  /** Column to sort by. Required by the API. */
  sort: string;
  sortorder?: "ASC" | "DESC";
  /** Column name → array of values. Values OR together, columns AND together. */
  filters?: Record<string, string[]>;
  /** Empty array returns every column. */
  columns?: string[];
};

/**
 * Reads credentials from the environment.
 *
 * Both or neither: a half-configured credential produces a 401 at request time,
 * and an unhandled 401 looks exactly like a supplier having no findings — which
 * is the most dangerous wrong answer this system can give.
 */
export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): DashboardCredentials | null {
  const user = env.FDA_DATADASHBOARD_USER?.trim();
  const key = env.FDA_DATADASHBOARD_KEY?.trim();
  if (!user || !key) return null;
  return { user, key };
}

/**
 * Pages through one endpoint and returns every row.
 *
 * `start` is 1-based, per FDA's own example request. Getting that wrong by one
 * silently drops the first record of every page.
 */
export async function fetchDataset<T>(
  endpoint: string,
  creds: DashboardCredentials,
  query: DashboardQuery,
  opts: { maxRecords?: number; fetchImpl?: typeof fetch } = {}
): Promise<T[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const maxRecords = opts.maxRecords ?? DEFAULT_MAX_RECORDS;
  const out: T[] = [];

  let start = 1;

  while (out.length < maxRecords) {
    const body = {
      start,
      rows: Math.min(PAGE_SIZE, maxRecords - out.length),
      sort: query.sort,
      sortorder: query.sortorder ?? "DESC",
      returntotalcount: true,
      filters: query.filters ?? {},
      columns: query.columns ?? [],
    };

    const res = await doFetch(`${BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization-User": creds.user,
        "Authorization-Key": creds.key,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401 || res.status === 403) {
      throw new DataDashboardError(
        "FDA rejected the Data Dashboard credentials. Check FDA_DATADASHBOARD_USER is the exact " +
        "email FDA approved and FDA_DATADASHBOARD_KEY is current — keys are reissued on request " +
        "to FDADataDashboard@fda.hhs.gov.",
        res.status
      );
    }
    if (res.status === 429) {
      throw new DataDashboardError("FDA rate-limited the Data Dashboard request.", 429);
    }
    if (!res.ok) {
      throw new DataDashboardError(`FDA Data Dashboard returned HTTP ${res.status}.`, res.status);
    }

    const json = (await res.json()) as DashboardResponse<T>;

    // The API answers 200 with a statuscode in the body, so an HTTP-only check
    // would treat a rejected query as an empty dataset.
    if (json.statuscode !== undefined && json.statuscode !== 200) {
      throw new DataDashboardError(
        `FDA Data Dashboard refused the query: ${json.message ?? `status ${json.statuscode}`}`
      );
    }

    const batch = json.result ?? [];

    // Accumulate no more than the budget allows. The page-size request is a
    // request, not a guarantee: a server that returns more rows than `rows`
    // asked for would otherwise walk straight past maxRecords, and this is the
    // loop standing between a first-ever pull and an unbounded one.
    out.push(...batch.slice(0, maxRecords - out.length));

    // The short-page check reads the RAW length, not the truncated one —
    // otherwise trimming the last batch would look like the end of the dataset
    // and quietly stop an ingest that still had pages to go.
    if (batch.length === 0 || batch.length < body.rows) break;
    if (out.length >= maxRecords) break;

    start += batch.length;
  }

  return out;
}

// ── Import refusals ─────────────────────────────────────────────────────────

export type RefusalRecord = {
  FEINumber?: string;
  FirmName?: string;
  AddressLine1?: string;
  AddressLine2?: string;
  City?: string;
  State?: string;
  ZipCode?: string;
  CountryCode?: string;
  CountryName?: string;
  ProductCode?: string;
  ProductCodeDescription?: string;
  ProductCategory?: string;
  IndustryCodeDescription?: string;
  RefusalDate?: string;
  RefusalCharges?: string;
  ShipmentID?: string;
  FDASampleAnalysis?: string;
  PrivateLabAnalysis?: string;
};

export function normaliseRefusal(r: RefusalRecord): NormalisedEvent | null {
  // ShipmentID already encodes entry number, reference document, line number and
  // line suffix, so it should identify a refused line on its own. The product
  // code is appended anyway: if that assumption is ever wrong, this produces a
  // visible duplicate rather than silently collapsing two distinct refusals
  // into one and losing a finding.
  const ref = [r.ShipmentID?.trim(), r.ProductCode?.trim()].filter(Boolean).join(":");
  if (!ref) return null;

  const firm = r.FirmName?.trim() || "Unnamed firm";
  const charges = shorten(r.RefusalCharges);
  const product = shorten(r.ProductCodeDescription, 60);

  return {
    source: "fda_import_refusals",
    source_ref: ref,
    event_type: "import_refusal",
    event_date: toIsoDate(r.RefusalDate),
    firm_name: r.FirmName?.trim() || null,
    firm_fei: r.FEINumber?.trim() || null,
    firm_country: r.CountryName?.trim() || r.CountryCode?.trim() || null,
    firm_address: [r.AddressLine1, r.AddressLine2, r.City, r.State, r.ZipCode]
      .filter(Boolean).join(", ") || null,
    product_description: r.ProductCodeDescription?.trim() || null,
    summary:
      `${firm}: shipment refused entry` +
      (product ? ` — ${product}` : "") +
      (charges ? `. Charges: ${charges}` : ""),
    // Refusals carry no FDA severity grade. Left null rather than invented:
    // findingSeverity() treats an ungraded refusal as a warning.
    classification: null,
    detail_json: r,
    source_url: "https://datadashboard.fda.gov/oii/cd/imprefusals.htm",
  };
}

// ── Inspection classifications ──────────────────────────────────────────────

export type InspectionRecord = {
  FEINumber?: string;
  LegalName?: string;
  AddressLine1?: string;
  AddressLine2?: string;
  City?: string;
  State?: string;
  ZipCode?: string;
  CountryCode?: string;
  CountryName?: string;
  InspectionID?: string;
  InspectionEndDate?: string;
  Classification?: string;
  ClassificationCode?: string;
  ProductType?: string;
  ProjectArea?: string;
  PostedCitations?: string;
};

const CLASSIFICATION_MEANING: Record<string, string> = {
  NAI: "no action indicated",
  VAI: "voluntary action indicated",
  OAI: "official action indicated",
};

export function normaliseInspection(r: InspectionRecord): NormalisedEvent | null {
  const ref = r.InspectionID?.trim();
  if (!ref) return null;

  const firm = r.LegalName?.trim() || "Unnamed firm";
  const code = (r.ClassificationCode ?? r.Classification ?? "").trim().toUpperCase();
  const meaning = CLASSIFICATION_MEANING[code];

  return {
    source: "fda_inspections_classifications",
    source_ref: ref,
    event_type: "inspection_classification",
    event_date: toIsoDate(r.InspectionEndDate),
    firm_name: r.LegalName?.trim() || null,
    firm_fei: r.FEINumber?.trim() || null,
    firm_country: r.CountryName?.trim() || r.CountryCode?.trim() || null,
    firm_address: [r.AddressLine1, r.AddressLine2, r.City, r.State, r.ZipCode]
      .filter(Boolean).join(", ") || null,
    product_description: r.ProjectArea?.trim() || null,
    summary:
      `${firm}: inspection classified ${code || "unclassified"}` +
      (meaning ? ` (${meaning})` : "") +
      (r.PostedCitations?.trim() ? ". Citations posted." : ""),
    classification: code || null,
    detail_json: r,
    source_url: "https://datadashboard.fda.gov/oii/cd/inspections.htm",
  };
}

// ── Compliance actions ──────────────────────────────────────────────────────

export type ComplianceActionRecord = {
  FEINumber?: string;
  LegalName?: string;
  AddressLine1?: string;
  AddressLine2?: string;
  City?: string;
  State?: string;
  ZipCode?: string;
  CountryCode?: string;
  CountryName?: string;
  ActionType?: string;
  ActionTakenDate?: string;
  CaseInjunctionID?: string;
  ProductType?: string;
  FiscalYear?: string;
};

/** FDA's ActionType strings mapped onto our event vocabulary. */
export function actionEventType(actionType: string | undefined): NormalisedEvent["event_type"] {
  const a = (actionType ?? "").toLowerCase();
  if (a.includes("warning letter")) return "warning_letter";
  if (a.includes("seizure")) return "seizure";
  if (a.includes("injunction")) return "injunction";
  return "other_action";
}

export function normaliseComplianceAction(r: ComplianceActionRecord): NormalisedEvent | null {
  const ref = r.CaseInjunctionID?.trim();
  if (!ref) return null;

  const firm = r.LegalName?.trim() || "Unnamed firm";
  const action = r.ActionType?.trim() || "Compliance action";

  return {
    source: "fda_compliance_actions",
    source_ref: ref,
    event_type: actionEventType(r.ActionType),
    event_date: toIsoDate(r.ActionTakenDate),
    firm_name: r.LegalName?.trim() || null,
    firm_fei: r.FEINumber?.trim() || null,
    firm_country: r.CountryName?.trim() || r.CountryCode?.trim() || null,
    firm_address: [r.AddressLine1, r.AddressLine2, r.City, r.State, r.ZipCode]
      .filter(Boolean).join(", ") || null,
    product_description: r.ProductType?.trim() || null,
    summary: `${firm}: ${action}`,
    classification: null,
    detail_json: r,
    source_url: "https://datadashboard.fda.gov/oii/cd/complianceactions.htm",
  };
}

// ── Per-source query construction ───────────────────────────────────────────

/**
 * Only food matters here. All three datasets cover every centre FDA regulates —
 * drugs, devices, tobacco, veterinary — and pulling those would bury a food
 * importer's review queue under findings about medical device firms.
 *
 * Refusals have no ProductType column, so they are narrowed by industry at
 * normalisation time instead of by filter. That is the one place volume is
 * traded for not silently excluding a food refusal FDA filed under an
 * unexpected industry code.
 */
const FOOD_PRODUCT_TYPE = "Food/Cosmetics";

export type DatasetSpec = {
  source: RegulatorySourceId;
  endpoint: string;
  sort: string;
  /** Date column used for windowed pulls; `From`/`To` are appended. */
  dateColumn: string;
  baseFilters: Record<string, string[]>;
  normalise: (row: any) => NormalisedEvent | null;
};

export const DATASETS: DatasetSpec[] = [
  {
    source: "fda_import_refusals",
    endpoint: "import_refusals",
    sort: "RefusalDate",
    dateColumn: "RefusalDate",
    baseFilters: {},
    normalise: normaliseRefusal,
  },
  {
    source: "fda_inspections_classifications",
    endpoint: "inspections_classifications",
    sort: "InspectionEndDate",
    dateColumn: "InspectionEndDate",
    baseFilters: { ProductType: [FOOD_PRODUCT_TYPE] },
    normalise: normaliseInspection,
  },
  {
    source: "fda_compliance_actions",
    endpoint: "compliance_actions",
    sort: "ActionTakenDate",
    dateColumn: "ActionTakenDate",
    baseFilters: { ProductType: [FOOD_PRODUCT_TYPE] },
    normalise: normaliseComplianceAction,
  },
];

export function datasetFor(source: RegulatorySourceId): DatasetSpec | null {
  return DATASETS.find((d) => d.source === source) ?? null;
}

/**
 * Fetches one dataset for a date window.
 *
 * The date filter uses the documented `<Column>From` / `<Column>To` convention.
 * FDA does not publish the expected date FORMAT for these, so ISO `YYYY-MM-DD`
 * is sent — and the ingest run records the window it asked for, so a format the
 * API silently ignores shows up as an implausible record count against a narrow
 * window rather than as an invisible gap.
 */
export async function fetchDashboardWindow(
  spec: DatasetSpec,
  creds: DashboardCredentials,
  window: { from: string; to: string },
  opts: { maxRecords?: number; fetchImpl?: typeof fetch } = {}
): Promise<NormalisedEvent[]> {
  const rows = await fetchDataset<Record<string, unknown>>(
    spec.endpoint,
    creds,
    {
      sort: spec.sort,
      sortorder: "DESC",
      filters: {
        ...spec.baseFilters,
        [`${spec.dateColumn}From`]: [window.from],
        [`${spec.dateColumn}To`]: [window.to],
      },
      columns: [],
    },
    opts
  );

  return rows
    .map(spec.normalise)
    .filter((e): e is NormalisedEvent => e !== null);
}
