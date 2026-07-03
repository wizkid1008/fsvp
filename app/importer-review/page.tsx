import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EvidenceReviewPanel } from "@/components/evidence/EvidenceReviewPanel";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

export default async function ImporterReviewPage() {
  const { role, realRole, user } = await requireProfileRole("/importer-review", ["us_importer", "administrator"]);
  const supabase = createServerSupabaseClient();
  const admin = createAdminSupabaseClient();

  // Get the importer's own ID so we can scope everything to their suppliers
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const importerId: string | null = resolvePreviewedAccountId(realRole, profile?.importer_id ?? null);

  // Administrators can see everything; importers are scoped to their importer_id
  let docsQuery = (admin.from("documents") as any)
    .select(`
      id, title, document_kind, original_filename, storage_path, uploaded_at,
      evidence_status, review_notes, expiration_date,
      linked_entity_type, linked_entity_id, facility_id,
      requirement_item_id, supplier_id, importer_id,
      uploaded_by_profile_id
    `)
    .is("soft_deleted_at", null)
    .in("evidence_status", ["submitted", "under_review", "needs_revision", "accepted", "rejected"])
    .order("uploaded_at", { ascending: false });

  if (role === "us_importer" && importerId) {
    docsQuery = docsQuery.eq("importer_id", importerId);
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
    uploaded_by_profile_id: string | null;
  }>;

  const supplierIds = [...new Set(docs.map((d) => d.supplier_id).filter(Boolean))] as string[];
  const itemIds     = [...new Set(docs.map((d) => d.requirement_item_id).filter(Boolean))] as string[];
  const profileIds  = [...new Set(docs.map((d) => d.uploaded_by_profile_id).filter(Boolean))] as string[];
  const facilityIds = [...new Set(docs.map((d) => d.facility_id).filter(Boolean))] as string[];
  const productIds  = [...new Set(docs.filter((d) => d.linked_entity_type === "product").map((d) => d.linked_entity_id).filter(Boolean))] as string[];

  const [suppliersRes, itemsRes, profilesRes, facilitiesRes, productsRes] = await Promise.all([
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

  const items = docs.map((d) => {
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
      evidence_status:       d.evidence_status as any,
      review_notes:          d.review_notes,
      expiration_date:       d.expiration_date,
      linked_entity_type:    d.linked_entity_type,
      linked_entity_id:      d.linked_entity_id,
      facility_id:           d.facility_id,
      entity_name:           entityName,
      supplier_name:         d.supplier_id ? (supplierMap.get(d.supplier_id) ?? "Unknown Supplier") : "—",
      importer_name:         null, // importer is the current user — no need to show it
      requirement_item_name: reqItem?.name ?? null,
      is_critical_blocker:   reqItem?.critical ?? false,
      uploaded_by_name:      d.uploaded_by_profile_id ? (profileMap.get(d.uploaded_by_profile_id) ?? null) : null,
    };
  });

  const pendingTotal  = items.filter((d) => d.evidence_status === "submitted" || d.evidence_status === "under_review").length;
  const criticalTotal = items.filter((d) => d.is_critical_blocker && (d.evidence_status === "submitted" || d.evidence_status === "under_review")).length;
  const acceptedTotal = items.filter((d) => d.evidence_status === "accepted").length;

  const metricTone = (v: number, warnAbove = 0): StatusTone =>
    v === 0 ? "neutral" : v > warnAbove ? "warning" : "success";

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Supplier Review Queue"
        description="Review evidence submitted by your suppliers. Accept compliant documents, request revisions, or reject non-compliant submissions."
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Pending Review",    value: pendingTotal,  tone: metricTone(pendingTotal, 0) as StatusTone },
          { label: "Critical Blockers", value: criticalTotal, tone: criticalTotal > 0 ? ("danger" as StatusTone) : ("neutral" as StatusTone) },
          { label: "Accepted",          value: acceptedTotal, tone: "success" as StatusTone },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <p className="text-xs font-medium text-slate-500">{m.label}</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-3xl font-semibold text-ink">{m.value}</p>
              <StatusBadge tone={m.tone}>{m.value > 0 ? "Active" : "None"}</StatusBadge>
            </div>
          </div>
        ))}
      </div>

      <EvidenceReviewPanel items={items} />
    </AppShell>
  );
}
