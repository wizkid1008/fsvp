type SupabaseLike = { from: (table: string) => any };

/**
 * Everything on the importer dashboard that needs a decision, fetched once.
 *
 * The dashboard used to run these queries in ImporterActionsSection while the
 * tiles above ran a second, separate set of count queries for Exporters,
 * Products, Facilities, Evidence and Open Actions — which was both duplicate
 * work and a duplicate of the sidebar. The tiles now read these counts and the
 * task list renders these rows, so there is one set of queries and one answer.
 */

/**
 * A row from one of the signal queries. The shape differs per query and the
 * embedded joins (suppliers, products_verify) are untyped by the Supabase
 * client here, so this stays permissive — the same `as any[]` treatment these
 * queries already had inline.
 */
export type SignalRow = {
  id: string;
  [key: string]: any;
};

export type ImporterSignals = {
  /** Evidence an exporter submitted that is waiting on the importer. */
  pendingReview: number;
  /** Approved records whose reassessment date has passed. */
  overdue: SignalRow[];
  /** Approved records due for reassessment within 60 days. */
  dueSoon: SignalRow[];
  /** Accepted documents expiring within 60 days, or already expired. */
  expiring: SignalRow[];
  /** Open or in-progress corrective actions. */
  actions: SignalRow[];
  /** Records still in draft. */
  drafts: SignalRow[];
  /**
   * Records not yet approved that carry no qualified individual signature at
   * all. Deliberately not called "blocked": this is a cheap existence check and
   * does not detect a signature gone STALE, which needs the per-record hash
   * comparison in lib/fsvp/qi-attestation.ts. It is a lower bound on what the
   * § 1.503 gate will refuse.
   */
  unsignedRecords: number;
  /**
   * Supplier/product pairs with no live applicability determination — never
   * determined, or the determination has lapsed. No FSVP record can be opened
   * or approved for these.
   */
  undeterminedPairs: number;
  /** True when nothing at all needs attention. */
  clear: boolean;
};

const PRE_APPROVAL_STATUSES = [
  "draft",
  "awaiting_supplier_evidence",
  "supplier_evidence_submitted",
  "supplier_evidence_accepted",
  "importer_review_pending",
];

export async function fetchImporterSignals(
  supabase: SupabaseLike,
  importerId: string,
  supplierIds: string[]
): Promise<ImporterSignals> {
  const now = new Date();
  const in60 = new Date();
  in60.setDate(in60.getDate() + 60);
  const in60Str = in60.toISOString().split("T")[0];

  const [
    pendingRes, overdueRes, dueSoonRes, expiringRes, actionsRes, draftRes,
    signedRes, openRecordsRes, allProductsRes, determinationsRes,
  ] = await Promise.all([
      // Importer-uploaded documents are accepted at upload, so they are not
      // pending anyone — excluding them keeps this from counting the importer's
      // own work as work.
      supplierIds.length
        ? (supabase.from("documents") as any)
            .select("id", { count: "exact", head: true })
            .in("supplier_id", supplierIds)
            .is("soft_deleted_at", null)
            .in("evidence_status", ["submitted", "under_review"])
            .neq("evidence_source", "importer_uploaded")
        : Promise.resolve({ count: 0 }),

      (supabase.from("fsvp_records") as any)
        .select("id, reassessment_due_at, suppliers(company_name), products_verify(product_name)")
        .eq("importer_id", importerId)
        .lt("reassessment_due_at", now.toISOString())
        .in("status", ["importer_approved", "conditionally_approved"])
        .order("reassessment_due_at"),

      (supabase.from("fsvp_records") as any)
        .select("id, reassessment_due_at, suppliers(company_name), products_verify(product_name)")
        .eq("importer_id", importerId)
        .gte("reassessment_due_at", now.toISOString())
        .lte("reassessment_due_at", in60.toISOString())
        .in("status", ["importer_approved", "conditionally_approved"])
        .order("reassessment_due_at"),

      supplierIds.length
        ? (supabase.from("documents") as any)
            .select("id, title, expiration_date, supplier_id")
            .in("supplier_id", supplierIds)
            .is("soft_deleted_at", null)
            .eq("evidence_status", "accepted")
            .not("expiration_date", "is", null)
            .lte("expiration_date", in60Str)
            .order("expiration_date")
            .limit(6)
        : Promise.resolve({ data: [] }),

      (supabase.from("corrective_actions") as any)
        .select("id, issue_description, triggered_at, suppliers(company_name)")
        .eq("importer_id", importerId)
        .in("status", ["open", "in_progress"])
        .order("triggered_at")
        .limit(5),

      (supabase.from("fsvp_records") as any)
        .select("id, suppliers(company_name), products_verify(product_name)")
        .eq("importer_id", importerId)
        .eq("status", "draft")
        .limit(5),

      // Which records have any live signature. PostgREST has no NOT EXISTS, so
      // take the two sets and subtract — both are small (one row per record).
      (supabase.from("qi_attestations") as any)
        .select("fsvp_record_id")
        .eq("importer_id", importerId)
        .is("revoked_at", null),

      (supabase.from("fsvp_records") as any)
        .select("id")
        .eq("importer_id", importerId)
        .in("status", PRE_APPROVAL_STATUSES),

      // Every food this importer has, and every live determination, so the
      // undetermined ones can be counted by subtraction — same shape as the
      // unsigned-records count above.
      supplierIds.length
        ? (supabase.from("products_verify") as any).select("id").in("supplier_id", supplierIds)
        : Promise.resolve({ data: [] }),

      (supabase.from("fsvp_applicability_determinations") as any)
        .select("product_id, expires_at")
        .eq("importer_id", importerId)
        .is("superseded_at", null),
    ]);

  const signedIds = new Set(
    ((signedRes.data ?? []) as Array<{ fsvp_record_id: string }>).map((a) => a.fsvp_record_id)
  );
  const openRecords = (openRecordsRes.data ?? []) as Array<{ id: string }>;
  const unsignedRecords = openRecords.filter((r) => !signedIds.has(r.id)).length;

  const today = now.toISOString().slice(0, 10);
  const liveDeterminedProducts = new Set(
    ((determinationsRes.data ?? []) as Array<{ product_id: string; expires_at: string | null }>)
      .filter((d) => !d.expires_at || d.expires_at >= today)
      .map((d) => d.product_id)
  );
  const undeterminedPairs = ((allProductsRes.data ?? []) as Array<{ id: string }>)
    .filter((p) => !liveDeterminedProducts.has(p.id)).length;

  const pendingReview = pendingRes.count ?? 0;
  const overdue  = (overdueRes.data ?? []) as SignalRow[];
  const dueSoon  = (dueSoonRes.data ?? []) as SignalRow[];
  const expiring = (expiringRes.data ?? []) as SignalRow[];
  const actions  = (actionsRes.data ?? []) as SignalRow[];
  const drafts   = (draftRes.data ?? []) as SignalRow[];

  return {
    pendingReview,
    overdue,
    dueSoon,
    expiring,
    actions,
    drafts,
    unsignedRecords,
    undeterminedPairs,
    clear:
      pendingReview === 0 && overdue.length === 0 && dueSoon.length === 0 &&
      expiring.length === 0 && actions.length === 0 && drafts.length === 0 &&
      unsignedRecords === 0 && undeterminedPairs === 0,
  };
}
