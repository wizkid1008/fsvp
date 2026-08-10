/**
 * Pulling FDA's published records in and proposing who they concern.
 *
 * The orchestration is deliberately dull: fetch, store the facts, propose the
 * links, record what happened. All the judgement lives in ./matching, and none
 * of it decides anything — every proposal lands as a 'candidate' for a person
 * to confirm. See 009_regulatory_intelligence.sql for why.
 *
 * Runs are recorded before the work starts and updated after, so a run that
 * dies mid-flight leaves a 'running' row with a start time rather than no trace
 * at all. A compliance screen that cannot say when it last refreshed has to be
 * able to say that it does not know.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fetchFoodEnforcement, normaliseEnforcement, OpenFdaError } from "./openfda";
import {
  credentialsFromEnv,
  datasetFor,
  fetchDashboardWindow,
  DataDashboardError,
} from "./datadashboard";
import type { NormalisedEvent } from "./events";
import { proposeMatches, type CountryLookup, type MatchableEntity } from "./matching";
import { findingSeverity, type RegulatorySourceId } from "./sources";
import { notify } from "@/lib/notifications/notify";

type AdminClient = SupabaseClient<Database>;

export type IngestResult = {
  source: RegulatorySourceId;
  runId: string;
  recordsSeen: number;
  recordsNew: number;
  candidatesCreated: number;
  error?: string;
};

/** Fetches one window's worth of a source, already normalised. */
type Fetcher = (window: { from: string; to: string }) => Promise<NormalisedEvent[]>;

/** How far back a first-ever ingest reaches. */
const INITIAL_LOOKBACK_DAYS = 730;
/** Overlap re-fetched on every incremental run, since FDA amends past records. */
const OVERLAP_DAYS = 14;

/**
 * PostgREST puts `.in(...)` filters in the query string, so a first-ever ingest
 * — two years of recalls, several thousand rows — would build a URL long enough
 * to be rejected by the gateway before it reached Postgres. Every batched read
 * and write below goes through here.
 */
const BATCH = 400;

function chunk<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

// ── Reference data ──────────────────────────────────────────────────────────

/**
 * Country lookup backed by the countries reference table rather than a second
 * hardcoded list in TypeScript, which would drift from it the first time either
 * changed.
 */
async function loadCountryLookup(admin: AdminClient): Promise<CountryLookup> {
  const { data } = await (admin.from("countries") as any).select("country_code, country_name");
  const byCode = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ country_code: string; country_name: string }>) {
    byCode.set(row.country_code.toUpperCase(), row.country_name);
  }
  return { nameForCode: (code) => byCode.get(code.toUpperCase()) ?? null };
}

type SupplierRow = {
  id: string;
  company_name: string;
  legal_entity_name: string | null;
  country: string | null;
  fei_number: string | null;
};

type FacilityRow = {
  id: string;
  facility_name: string;
  fei_number: string | null;
  supplier_id: string | null;
};

/**
 * Everything we might attribute an event to, plus the importers entitled to see
 * that attribution.
 *
 * Suppliers are global entities shared between importers, so the tenant comes
 * from supplier_relationships, not from the supplier row. An event matching a
 * supplier produces one candidate per importer who buys from them — each
 * importer confirms for itself, because under § 1.505 each importer performs
 * its own evaluation.
 */
async function loadMatchTargets(admin: AdminClient) {
  const [{ data: suppliers }, { data: links }, { data: facilities }] = await Promise.all([
    (admin.from("suppliers") as any)
      .select("id, company_name, legal_entity_name, country, fei_number"),
    (admin.from("supplier_relationships") as any)
      .select("importer_id, supplier_id")
      .eq("relationship_type", "importer_supplier")
      .in("status", ["active", "pending_invite"]),
    (admin.from("facilities_verify") as any)
      .select("id, facility_name, fei_number, supplier_id"),
  ]);

  const importersBySupplier = new Map<string, Set<string>>();
  for (const l of (links ?? []) as Array<{ importer_id: string | null; supplier_id: string | null }>) {
    if (!l.importer_id || !l.supplier_id) continue;
    if (!importersBySupplier.has(l.supplier_id)) importersBySupplier.set(l.supplier_id, new Set());
    importersBySupplier.get(l.supplier_id)!.add(l.importer_id);
  }

  const supplierRows = (suppliers ?? []) as SupplierRow[];
  const countryBySupplier = new Map(supplierRows.map((s) => [s.id, s.country]));

  const supplierTargets: MatchableEntity[] = supplierRows.map((s) => ({
    id: s.id,
    // The legal entity name is what appears in FDA data more often than the
    // trading name, so it is preferred when present.
    name: s.legal_entity_name?.trim() || s.company_name,
    countryCode: s.country,
    feiNumber: s.fei_number,
  }));

  // A facility has no country of its own in this schema, so it inherits its
  // parent supplier's. A facility with no parent can only ever match on FEI.
  const facilityTargets: MatchableEntity[] = ((facilities ?? []) as FacilityRow[]).map((f) => ({
    id: f.id,
    name: f.facility_name,
    countryCode: f.supplier_id ? countryBySupplier.get(f.supplier_id) ?? null : null,
    feiNumber: f.fei_number,
  }));

  const supplierIdForFacility = new Map(
    ((facilities ?? []) as FacilityRow[]).map((f) => [f.id, f.supplier_id])
  );

  return { supplierTargets, facilityTargets, importersBySupplier, supplierIdForFacility };
}

// ── The run ─────────────────────────────────────────────────────────────────

/**
 * Ingests openFDA food enforcement records and proposes candidate matches.
 *
 * The window starts where the last successful run ended, less an overlap:
 * FDA amends published recalls when they expand, so the tail has to be
 * re-read rather than assumed final. Re-reading is safe because
 * (source, source_ref) is unique.
 */
async function runIngest(
  admin: AdminClient,
  source: RegulatorySourceId,
  fetcher: Fetcher,
  opts: { triggeredByProfileId?: string | null } = {}
): Promise<IngestResult> {
  const { data: lastRun } = await (admin.from("regulatory_ingest_runs") as any)
    .select("window_to")
    .eq("source", source)
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const from = lastRun?.window_to
    ? isoDate(new Date(new Date(lastRun.window_to).getTime() - OVERLAP_DAYS * 86_400_000))
    : isoDate(daysAgo(INITIAL_LOOKBACK_DAYS));
  const to = isoDate(new Date());

  const { data: run } = await (admin.from("regulatory_ingest_runs") as any)
    .insert({
      source,
      status: "running",
      window_from: from,
      window_to: to,
      triggered_by_profile_id: opts.triggeredByProfileId ?? null,
    })
    .select("id")
    .single();

  const runId: string = run.id;

  try {
    const events = await fetcher({ from, to });

    const { recordsNew, eventIds } = await storeEvents(admin, events, runId, source);
    const candidatesCreated = await proposeCandidates(admin, events, eventIds);

    await (admin.from("regulatory_ingest_runs") as any)
      .update({
        status: "succeeded",
        records_seen: events.length,
        records_new: recordsNew,
        candidates_created: candidatesCreated,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return { source, runId, recordsSeen: events.length, recordsNew, candidatesCreated };
  } catch (err) {
    const message =
      err instanceof OpenFdaError || err instanceof DataDashboardError ? err.message
      : err instanceof Error ? err.message
      : "Unknown error during ingest.";

    await (admin.from("regulatory_ingest_runs") as any)
      .update({ status: "failed", error_message: message, completed_at: new Date().toISOString() })
      .eq("id", runId);

    return { source, runId, recordsSeen: 0, recordsNew: 0, candidatesCreated: 0, error: message };
  }
}

/** openFDA food enforcement (recalls). Needs no credentials. */
export async function runFoodEnforcementIngest(
  admin: AdminClient,
  opts: { apiKey?: string; triggeredByProfileId?: string | null; fetchImpl?: typeof fetch } = {}
): Promise<IngestResult> {
  return runIngest(
    admin,
    "fda_food_enforcement",
    async (window) => {
      const raw = await fetchFoodEnforcement(window, {
        apiKey: opts.apiKey,
        fetchImpl: opts.fetchImpl,
      });
      return raw
        .map(normaliseEnforcement)
        .filter((e): e is NormalisedEvent => e !== null);
    },
    opts
  );
}

/**
 * One of the three credentialed Data Dashboard datasets.
 *
 * Throws rather than returning a result when credentials are absent: a run row
 * saying "succeeded, 0 records" for a source that was never actually asked
 * would be a lie on the freshness banner, and that banner is the only thing
 * standing between a stale screen and a confident wrong answer.
 */
export async function runDataDashboardIngest(
  admin: AdminClient,
  source: RegulatorySourceId,
  opts: { triggeredByProfileId?: string | null; fetchImpl?: typeof fetch } = {}
): Promise<IngestResult> {
  const spec = datasetFor(source);
  if (!spec) throw new Error(`${source} is not a Data Dashboard dataset.`);

  const creds = credentialsFromEnv();
  if (!creds) {
    throw new DataDashboardError(
      "FDA_DATADASHBOARD_USER and FDA_DATADASHBOARD_KEY are not both configured."
    );
  }

  return runIngest(
    admin,
    source,
    (window) => fetchDashboardWindow(spec, creds, window, { fetchImpl: opts.fetchImpl }),
    opts
  );
}

/**
 * Every source this deployment can actually reach, in one pass.
 *
 * Sources are run in sequence, not in parallel: they share the matching pass
 * and the candidate table, and three concurrent writers racing on the same
 * dedupe read would produce duplicate candidates. Regulatory data refreshes
 * weekly at best — there is nothing to gain by hurrying.
 *
 * A failing source does not stop the others. Its run row records the error and
 * the freshness banner shows it as stale, which is the honest outcome.
 */
export async function runAllIngests(
  admin: AdminClient,
  opts: { triggeredByProfileId?: string | null; fetchImpl?: typeof fetch } = {}
): Promise<IngestResult[]> {
  const results: IngestResult[] = [
    await runFoodEnforcementIngest(admin, {
      apiKey: process.env.OPENFDA_API_KEY?.trim() || undefined,
      ...opts,
    }),
  ];

  if (credentialsFromEnv()) {
    for (const source of [
      "fda_import_refusals",
      "fda_inspections_classifications",
      "fda_compliance_actions",
    ] as const) {
      results.push(await runDataDashboardIngest(admin, source, opts));
    }
  }

  return results;
}

/**
 * Writes the facts, ignoring ones already held.
 *
 * Upserted with ignoreDuplicates so a re-run does not overwrite the
 * retrieved_at of a record we already had — the date we first learned something
 * is part of the compliance story.
 */
async function storeEvents(
  admin: AdminClient,
  events: NormalisedEvent[],
  runId: string,
  source: RegulatorySourceId
): Promise<{ recordsNew: number; eventIds: Map<string, string> }> {
  const eventIds = new Map<string, string>();
  if (events.length === 0) return { recordsNew: 0, eventIds };

  const rows = events.map((e) => ({
    source: e.source,
    source_ref: e.source_ref,
    event_type: e.event_type,
    event_date: e.event_date,
    firm_name: e.firm_name,
    firm_fei: e.firm_fei,
    firm_country: e.firm_country,
    firm_address: e.firm_address,
    product_description: e.product_description,
    summary: e.summary,
    classification: e.classification,
    detail_json: e.detail_json,
    source_url: e.source_url,
    ingest_run_id: runId,
  }));

  let recordsNew = 0;
  for (const batch of chunk(rows)) {
    const { data: inserted, error } = await (admin.from("regulatory_events") as any)
      .upsert(batch, { onConflict: "source,source_ref", ignoreDuplicates: true })
      .select("id, source_ref");

    if (error) throw new Error(`Storing FDA records failed: ${error.message}`);
    recordsNew += (inserted ?? []).length;
  }

  // Upsert-with-ignore returns only the new rows, so the ids of events we
  // already held have to be read back before they can be matched against.
  for (const batch of chunk(events.map((e) => e.source_ref))) {
    const { data: all } = await (admin.from("regulatory_events") as any)
      .select("id, source_ref")
      .eq("source", source)
      .in("source_ref", batch);

    for (const row of (all ?? []) as Array<{ id: string; source_ref: string }>) {
      eventIds.set(row.source_ref, row.id);
    }
  }

  return { recordsNew, eventIds };
}

/**
 * Proposes candidate links for every event, per importer.
 *
 * Existing rows are left alone: once a person has confirmed or rejected a
 * match, a later ingest must not reopen the question or quietly flip the
 * decision back to unreviewed.
 */
async function proposeCandidates(
  admin: AdminClient,
  events: NormalisedEvent[],
  eventIds: Map<string, string>
): Promise<number> {
  if (events.length === 0) return 0;

  const lookup = await loadCountryLookup(admin);
  const { supplierTargets, facilityTargets, importersBySupplier, supplierIdForFacility } =
    await loadMatchTargets(admin);

  type Row = {
    importer_id: string;
    regulatory_event_id: string;
    supplier_id: string | null;
    facility_id: string | null;
    match_status: string;
    match_method: string;
    match_confidence: number;
    match_rationale: string;
  };

  const rows: Row[] = [];
  const eventById = new Map<string, NormalisedEvent>();

  for (const event of events) {
    const eventId = eventIds.get(event.source_ref);
    if (!eventId) continue;
    eventById.set(eventId, event);

    const shaped = {
      firmName: event.firm_name,
      firmCountry: event.firm_country,
      firmFei: event.firm_fei,
    };

    for (const { entity, candidate } of proposeMatches(supplierTargets, shaped, lookup)) {
      for (const importerId of importersBySupplier.get(entity.id) ?? []) {
        rows.push({
          importer_id: importerId,
          regulatory_event_id: eventId,
          supplier_id: entity.id,
          facility_id: null,
          match_status: "candidate",
          match_method: candidate.method,
          match_confidence: candidate.confidence,
          match_rationale: candidate.rationale,
        });
      }
    }

    for (const { entity, candidate } of proposeMatches(facilityTargets, shaped, lookup)) {
      const parentSupplier = supplierIdForFacility.get(entity.id);
      if (!parentSupplier) continue;
      for (const importerId of importersBySupplier.get(parentSupplier) ?? []) {
        rows.push({
          importer_id: importerId,
          regulatory_event_id: eventId,
          supplier_id: null,
          facility_id: entity.id,
          match_status: "candidate",
          match_method: candidate.method,
          match_confidence: candidate.confidence,
          match_rationale: candidate.rationale,
        });
      }
    }
  }

  if (rows.length === 0) return 0;

  // Deduped by reading first rather than with ON CONFLICT: the unique indexes
  // backing these rows are partial (one for supplier targets, one for facility
  // targets, each with a WHERE clause), and PostgREST cannot express the
  // predicate that Postgres needs to infer a partial index. Filtering here is
  // explicit and, more importantly, cannot silently reset a row a reviewer has
  // already confirmed or rejected.
  const key = (r: {
    importer_id: string;
    regulatory_event_id: string;
    supplier_id: string | null;
    facility_id: string | null;
  }) => `${r.importer_id}|${r.regulatory_event_id}|${r.supplier_id ?? ""}|${r.facility_id ?? ""}`;

  const held = new Set<string>();
  for (const batch of chunk([...new Set(rows.map((r) => r.regulatory_event_id))])) {
    const { data: existing } = await (admin.from("supplier_compliance_history") as any)
      .select("importer_id, regulatory_event_id, supplier_id, facility_id")
      .in("regulatory_event_id", batch);

    for (const r of (existing ?? []) as any[]) held.add(key(r));
  }

  const fresh = rows.filter((r) => !held.has(key(r)));
  if (fresh.length === 0) return 0;

  let count = 0;
  for (const batch of chunk(fresh)) {
    const { data: created, error } = await (admin.from("supplier_compliance_history") as any)
      .insert(batch)
      .select("id");

    if (error) throw new Error(`Recording candidate matches failed: ${error.message}`);
    count += (created ?? []).length;
  }

  // A Class I recall means a reasonable probability of serious harm, which is
  // the one finding worth interrupting someone for. Driven off `fresh` rather
  // than every match, so re-running an ingest does not re-alert on findings
  // already sitting in the queue.
  //
  // The wording matters: "possible" and "not been confirmed", never "your
  // supplier was recalled". At this point nobody has agreed the record is even
  // about them, and an alert that overstates its own certainty is how an
  // unconfirmed guess becomes an accepted fact.
  // Capped because a first-ever ingest reaches back two years: without a limit
  // the very first refresh could bury a tenant's notification list under
  // historical findings and train them to ignore it. The queue on
  // /compliance-history holds everything; the alert is only the nudge.
  const ALERT_CAP = 25;
  const alerted = new Set<string>();

  for (const row of fresh) {
    if (alerted.size >= ALERT_CAP) break;
    if (!row.supplier_id) continue;
    const event = eventById.get(row.regulatory_event_id);
    if (!event) continue;
    if (findingSeverity(event.event_type, event.classification) !== "critical") continue;

    const alertKey = `${row.importer_id}:${row.supplier_id}:${event.source_ref}`;
    if (alerted.has(alertKey)) continue;
    alerted.add(alertKey);

    await notify(admin, {
      importerId: row.importer_id,
      type: "regulatory_finding_candidate",
      title: "Possible FDA finding for one of your suppliers",
      body:
        `${event.summary} — this record resembles one of your suppliers but has not been ` +
        `confirmed as theirs. Review it before relying on it either way.`,
      targetUrl: "/compliance-history",
      severity: "warning",
    });
  }

  return count;
}
