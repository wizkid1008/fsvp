// Required-evidence progress for many exporters, facilities or products at once.
//
// The per-entity checklist (components/evidence/RequiredEvidenceChecklist.tsx)
// answers "what does THIS one still owe?". The list pages and the dashboard ask
// the same question of every row, so this runs the same judgement —
// statusesByItem, bestStatus, generatedItemStatus from ./evidence-scope — in a
// handful of queries rather than one checklist per row.
//
// Tenancy: callers pass the entity ids they are allowed to show. When
// `importerId` is given, documents are limited to "filed for this importer, or
// for nobody in particular" — the rule app/exporters/page.tsx has always
// applied — so an admin-client caller cannot count another tenant's uploads.
//
// Failures throw rather than come back empty. A Cloudflare Worker has a fixed
// subrequest budget per page load, and a query made after it is spent fails —
// which this used to read as "no rule version", reporting "no documents
// required" for exporters that owe eleven. A caller that can do without the
// counts catches and leaves them absent; nothing should show a failure as zero.

import {
  evidenceProgress,
  generatedItemStatus,
  statusesByItem,
  type EvidenceProgress,
  type EvidenceViewer,
  type GeneratedHazardAnalysis,
  type ScopedDocument,
} from "./evidence-scope";

type SupabaseLike = { from: (table: string) => any };

export type EvidenceEntityType = "supplier" | "facility" | "product";

/** Keeps `.in()` filters well inside URL length limits. */
const CHUNK = 100;

type QueryResult<T> = { data: T | null; error?: { message: string } | null };

function orThrow<T>({ data, error }: QueryResult<T>, what: string): T | null {
  if (error) throw new Error(`Evidence progress: ${what} failed — ${error.message}`);
  return data;
}

async function inChunks<T>(
  ids: string[],
  what: string,
  run: (chunk: string[]) => Promise<QueryResult<T[]>>
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    out.push(...(orThrow(await run(ids.slice(i, i + CHUNK)), what) ?? []));
  }
  return out;
}

type RequiredItem = { id: string; item_key: string; evidence_scope?: string | null };
type Doc = ScopedDocument & { entity_id: string | null };

export async function fetchEvidenceProgress(
  client: SupabaseLike,
  entityType: EvidenceEntityType,
  entityIds: string[],
  { importerId }: { importerId: string | null }
): Promise<Map<string, EvidenceProgress>> {
  const out = new Map<string, EvidenceProgress>();
  const ids = [...new Set(entityIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const pubVersion = orThrow<{ id: string }>(
    await (client.from("rule_versions") as any)
      .select("id")
      .eq("status", "published")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "published rule version"
  );
  if (!pubVersion?.id) return out;

  const sections = orThrow<unknown[]>(
    await (client.from("requirement_sections") as any)
      .select("requirement_items(id, item_key, is_required, evidence_scope)")
      .eq("rule_version_id", pubVersion.id)
      .eq("applies_to", entityType),
    "requirement sections"
  );

  const requiredItems: RequiredItem[] = ((sections ?? []) as Array<{
    requirement_items: Array<RequiredItem & { is_required: boolean }>;
  }>).flatMap((s) => (s.requirement_items ?? []).filter((i) => i.is_required));
  if (requiredItems.length === 0) return out;

  // The column that ties a document to the entity — the same one the checklist
  // filters on for each type.
  const entityColumn =
    entityType === "supplier" ? "supplier_id" : entityType === "facility" ? "facility_id" : "linked_entity_id";

  const docs = await inChunks<Record<string, any>>(ids, "documents", (chunk) => {
    let query = (client.from("documents") as any)
      .select(`${entityColumn}, requirement_item_id, evidence_status, importer_id`)
      .in(entityColumn, chunk)
      .is("soft_deleted_at", null)
      .not("requirement_item_id", "is", null);
    if (entityType === "product") query = query.eq("linked_entity_type", "product");
    if (importerId) query = query.or(`importer_id.eq.${importerId},importer_id.is.null`);
    return query;
  });

  const docsByEntity = new Map<string, Doc[]>();
  for (const row of docs) {
    const entityId = row[entityColumn] as string | null;
    if (!entityId) continue;
    const list = docsByEntity.get(entityId) ?? [];
    list.push({
      entity_id: entityId,
      requirement_item_id: row.requirement_item_id,
      evidence_status: row.evidence_status,
      importer_id: row.importer_id,
    });
    docsByEntity.set(entityId, list);
  }

  // Relationship-scoped items exist only on suppliers. Without an importer the
  // viewer is the exporter, judged across every importer it serves.
  const importersBySupplier = new Map<string, string[]>();
  if (entityType === "supplier" && !importerId) {
    const links = await inChunks<{ supplier_id: string; importer_id: string | null }>(ids, "relationships", (chunk) =>
      (client.from("supplier_relationships") as any)
        .select("supplier_id, importer_id")
        .eq("relationship_type", "importer_supplier")
        .in("status", ["active", "pending_invite"])
        .in("supplier_id", chunk)
    );
    for (const link of links) {
      if (!link.importer_id) continue;
      const list = importersBySupplier.get(link.supplier_id) ?? [];
      if (!list.includes(link.importer_id)) list.push(link.importer_id);
      importersBySupplier.set(link.supplier_id, list);
    }
  }

  const analysisByProduct = entityType === "product"
    ? await fetchHazardAnalyses(client, ids, importerId)
    : new Map<string, GeneratedHazardAnalysis>();

  for (const entityId of ids) {
    const viewer: EvidenceViewer = importerId
      ? { kind: "importer", importerId }
      : { kind: "exporter", linkedImporterIds: importersBySupplier.get(entityId) ?? [] };
    const statuses = statusesByItem(requiredItems, docsByEntity.get(entityId) ?? [], viewer);

    const analysis = analysisByProduct.get(entityId) ?? null;
    if (analysis) {
      for (const item of requiredItems) {
        const generated = generatedItemStatus(item.item_key, analysis);
        if (generated) statuses.set(item.id, [generated]);
      }
    }

    out.set(entityId, evidenceProgress(requiredItems, statuses));
  }

  return out;
}

/**
 * The latest non-superseded hazard analysis on each product's latest FSVP
 * record — what the product checklist reads, one product at a time.
 */
async function fetchHazardAnalyses(
  client: SupabaseLike,
  productIds: string[],
  importerId: string | null
): Promise<Map<string, GeneratedHazardAnalysis>> {
  const records = await inChunks<{ id: string; product_id: string; created_at: string }>(productIds, "FSVP records", (chunk) => {
    let query = (client.from("fsvp_records") as any)
      .select("id, product_id, created_at")
      .in("product_id", chunk);
    if (importerId) query = query.eq("importer_id", importerId);
    return query;
  });

  const latestRecordByProduct = new Map<string, { id: string; created_at: string }>();
  for (const record of records) {
    const current = latestRecordByProduct.get(record.product_id);
    if (!current || record.created_at > current.created_at) latestRecordByProduct.set(record.product_id, record);
  }

  const recordIds = [...latestRecordByProduct.values()].map((r) => r.id);
  const analyses = await inChunks<{
    fsvp_record_id: string;
    status: string;
    version: number;
    fsvp_plan_hazard_items: Array<{ id: string }> | null;
  }>(recordIds, "hazard analyses", (chunk) =>
    (client.from("fsvp_plan_hazard_analyses") as any)
      .select("fsvp_record_id, status, version, fsvp_plan_hazard_items(id)")
      .in("fsvp_record_id", chunk)
      .neq("status", "superseded")
  );

  const latestByRecord = new Map<string, (typeof analyses)[number]>();
  for (const analysis of analyses) {
    const current = latestByRecord.get(analysis.fsvp_record_id);
    if (!current || analysis.version > current.version) latestByRecord.set(analysis.fsvp_record_id, analysis);
  }

  const out = new Map<string, GeneratedHazardAnalysis>();
  for (const [productId, record] of latestRecordByProduct) {
    const analysis = latestByRecord.get(record.id);
    if (analysis) {
      out.set(productId, { status: analysis.status, itemCount: (analysis.fsvp_plan_hazard_items ?? []).length });
    }
  }
  return out;
}
