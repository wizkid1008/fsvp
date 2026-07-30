import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

export interface ReviewQueueItem {
  id: string;
  title: string;
  document_kind: string;
  original_filename: string | null;
  has_file: boolean;
  uploaded_at: string;
  evidence_status: string;
  review_notes: string | null;
  expiration_date: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  facility_id: string | null;
  entity_name: string | null;
  supplier_name: string;
  importer_name: string | null;
  // supplier_attested | importer_uploaded | third_party — an importer's own
  // upload is not pending anyone else's review, and should not read as though
  // a supplier submitted it.
  evidence_source: string;
  requirement_item_name: string | null;
  is_critical_blocker: boolean;
  uploaded_by_name: string | null;
}

/**
 * Loads the evidence review queue, optionally scoped to a single importer.
 * Pass `importerId` to scope (and hide the redundant importer name column);
 * omit it for the platform-wide queue, which also resolves importer names.
 *
 * Scoping is by the importer↔exporter RELATIONSHIP, not by the importer_id
 * stamped on the document at upload time. Suppliers have no importer_id on
 * their profile, so their uploads carry `importer_id = null`, and the previous
 * `.eq("importer_id", …)` filter excluded NULL — which meant an importer's
 * queue never showed evidence uploaded by their own suppliers. It only looked
 * correct because the reviewer/admin queue is unfiltered.
 */
export async function fetchReviewQueue(admin: AdminClient, importerId?: string | null): Promise<ReviewQueueItem[]> {
  let scopedSupplierIds: string[] | null = null;

  if (importerId) {
    const { data: links } = await (admin.from("supplier_relationships") as any)
      .select("supplier_id")
      .eq("relationship_type", "importer_supplier")
      .eq("importer_id", importerId)
      .in("status", ["active", "pending_invite"]);

    scopedSupplierIds = ((links ?? []) as Array<{ supplier_id: string }>)
      .map((l) => l.supplier_id)
      .filter(Boolean);

    // No linked exporters yet — nothing to review. Return early rather than
    // building a query with an empty IN list.
    if (scopedSupplierIds.length === 0) return [];
  }

  let docsQuery = (admin.from("documents") as any)
    .select(`
      id, title, document_kind, original_filename, storage_path, uploaded_at,
      evidence_status, review_notes, expiration_date, evidence_source,
      linked_entity_type, linked_entity_id, facility_id,
      requirement_item_id, supplier_id, importer_id,
      uploaded_by_profile_id
    `)
    .is("soft_deleted_at", null)
    .in("evidence_status", ["submitted", "under_review", "needs_revision", "accepted", "rejected"])
    .order("uploaded_at", { ascending: false });

  if (scopedSupplierIds) {
    docsQuery = docsQuery.in("supplier_id", scopedSupplierIds);
  }

  const { data: rawDocs } = await docsQuery;

  const docs = (rawDocs ?? []) as Array<{
    id: string;
    title: string;
    document_kind: string;
    original_filename: string | null;
    storage_path: string | null;
    uploaded_at: string;
    evidence_status: string;
    review_notes: string | null;
    expiration_date: string | null;
    linked_entity_type: string | null;
    linked_entity_id: string | null;
    facility_id: string | null;
    requirement_item_id: string | null;
    supplier_id: string | null;
    importer_id: string | null;
    evidence_source: string | null;
    uploaded_by_profile_id: string | null;
  }>;

  const supplierIds = [...new Set(docs.map((d) => d.supplier_id).filter(Boolean))] as string[];
  const itemIds     = [...new Set(docs.map((d) => d.requirement_item_id).filter(Boolean))] as string[];
  const profileIds  = [...new Set(docs.map((d) => d.uploaded_by_profile_id).filter(Boolean))] as string[];
  const facilityIds = [...new Set(docs.map((d) => d.facility_id).filter(Boolean))] as string[];
  const productIds  = [...new Set(docs.filter((d) => d.linked_entity_type === "product").map((d) => d.linked_entity_id).filter(Boolean))] as string[];
  const importerIds = importerId ? [] : ([...new Set(docs.map((d) => d.importer_id).filter(Boolean))] as string[]);

  const [suppliersRes, itemsRes, profilesRes, facilitiesRes, productsRes, importersRes] = await Promise.all([
    supplierIds.length > 0
      ? (admin.from("suppliers") as any).select("id, company_name").in("id", supplierIds)
      : Promise.resolve({ data: [] }),
    itemIds.length > 0
      ? (admin.from("requirement_items") as any).select("id, item_name, is_critical_blocker").in("id", itemIds)
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? (admin.from("profiles") as any).select("id, full_name, email").in("id", profileIds)
      : Promise.resolve({ data: [] }),
    facilityIds.length > 0
      ? (admin.from("facilities_verify") as any).select("id, facility_name").in("id", facilityIds)
      : Promise.resolve({ data: [] }),
    productIds.length > 0
      ? (admin.from("products_verify") as any).select("id, product_name").in("id", productIds)
      : Promise.resolve({ data: [] }),
    // importers has legal_name / display_name — there is no company_name column,
    // so the previous select errored and every importer_name came back null.
    importerIds.length > 0
      ? (admin.from("importers") as any).select("id, display_name").in("id", importerIds)
      : Promise.resolve({ data: [] }),
  ]);

  const supplierMap = new Map(
    ((suppliersRes.data ?? []) as Array<{ id: string; company_name: string }>).map((s) => [s.id, s.company_name])
  );
  const itemMap = new Map(
    ((itemsRes.data ?? []) as Array<{ id: string; item_name: string; is_critical_blocker: boolean | null }>)
      .map((i) => [i.id, { name: i.item_name, critical: !!i.is_critical_blocker }])
  );
  const profileMap = new Map(
    ((profilesRes.data ?? []) as Array<{ id: string; full_name: string | null; email: string }>)
      .map((p) => [p.id, p.full_name || p.email])
  );
  const facilityMap = new Map(
    ((facilitiesRes.data ?? []) as Array<{ id: string; facility_name: string }>).map((f) => [f.id, f.facility_name])
  );
  const productMap = new Map(
    ((productsRes.data ?? []) as Array<{ id: string; product_name: string }>).map((p) => [p.id, p.product_name])
  );
  const importerMap = new Map(
    ((importersRes.data ?? []) as Array<{ id: string; display_name: string }>).map((i) => [i.id, i.display_name])
  );

  return docs.map((d) => {
    const reqItem = d.requirement_item_id ? itemMap.get(d.requirement_item_id) : null;
    const entityName =
      d.linked_entity_type === "facility" && d.facility_id
        ? (facilityMap.get(d.facility_id) ?? null)
        : d.linked_entity_type === "product" && d.linked_entity_id
        ? (productMap.get(d.linked_entity_id) ?? null)
        : null;

    return {
      id:                    d.id,
      title:                 d.title,
      document_kind:         d.document_kind,
      original_filename:     d.original_filename,
      has_file:              !!d.storage_path,
      uploaded_at:           d.uploaded_at,
      evidence_status:       d.evidence_status,
      review_notes:          d.review_notes,
      expiration_date:       d.expiration_date,
      linked_entity_type:    d.linked_entity_type,
      linked_entity_id:      d.linked_entity_id,
      facility_id:           d.facility_id,
      entity_name:           entityName,
      supplier_name:         d.supplier_id ? (supplierMap.get(d.supplier_id) ?? "Unknown Supplier") : "—",
      importer_name:         importerId ? null : (d.importer_id ? (importerMap.get(d.importer_id) ?? null) : null),
      evidence_source:       d.evidence_source ?? "supplier_attested",
      requirement_item_name: reqItem?.name ?? null,
      is_critical_blocker:   reqItem?.critical ?? false,
      uploaded_by_name:      d.uploaded_by_profile_id ? (profileMap.get(d.uploaded_by_profile_id) ?? null) : null,
    };
  });
}

export function reviewQueueTotals(items: ReviewQueueItem[]) {
  // Only supplier-submitted evidence is genuinely "pending review". Documents
  // the importer uploaded themselves are already accepted at upload, so
  // counting them here would inflate the queue with work that does not exist.
  const awaitingReview = (d: ReviewQueueItem) =>
    (d.evidence_status === "submitted" || d.evidence_status === "under_review") &&
    d.evidence_source !== "importer_uploaded";

  const pendingTotal  = items.filter(awaitingReview).length;
  const criticalTotal = items.filter((d) => d.is_critical_blocker && awaitingReview(d)).length;
  const acceptedTotal = items.filter((d) => d.evidence_status === "accepted").length;
  return { pendingTotal, criticalTotal, acceptedTotal };
}
