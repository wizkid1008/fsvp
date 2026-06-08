import { EvidenceUploadPanel } from "@/components/evidence/EvidenceUploadPanel";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { FileArchive } from "lucide-react";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function evidenceTone(status: string | null): StatusTone {
  if (status === "accepted") return "success";
  if (status === "under_review") return "info";
  if (status === "needs_revision" || status === "rejected") return "danger";
  if (status === "submitted") return "warning";
  return "neutral";
}

function evidenceLabel(status: string | null): string {
  if (!status || status === "not_submitted") return "Not Submitted";
  const map: Record<string, string> = {
    accepted: "Accepted",
    expired: "Expired",
    needs_revision: "Needs Revision",
    rejected: "Rejected",
    submitted: "Submitted",
    under_review: "Under Review"
  };
  return map[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function MyEvidencePage() {
  const { role, user } = await requireProfileRole("/my-evidence", ["supplier", "administrator"]);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id")
    .eq("id", user.id)
    .maybeSingle();

  const supplierId = (profile?.supplier_id as string | null) ?? "";
  const docsQuery = (supabase.from("documents") as any)
    .select("id, title, document_kind, original_filename, uploaded_at, evidence_status, review_notes, requirement_item_id, linked_entity_type, facility_id, expiration_date")
    .is("soft_deleted_at", null)
    .order("uploaded_at", { ascending: false });
  const filteredDocsQuery = supplierId
    ? docsQuery.eq("supplier_id", supplierId)
    : docsQuery.eq("uploaded_by_profile_id", user.id);

  const [docsRes, suppliersRes, productsRes, facilitiesRes, facilityAccessRes, categoriesRes, pubVersionRes] = await Promise.all([
    filteredDocsQuery,
    supplierId
      ? (supabase.from("suppliers") as any).select("id, company_name").eq("id", supplierId)
      : (supabase.from("suppliers") as any).select("id, company_name").order("company_name"),
    supplierId
      ? (supabase.from("products_verify") as any).select("id, product_name, supplier_id, facility_id").eq("supplier_id", supplierId).order("product_name")
      : (supabase.from("products_verify") as any).select("id, product_name, supplier_id, facility_id").order("product_name"),
    (supabase.from("facilities_verify") as any).select("id, facility_name, supplier_id").order("facility_name"),
    supplierId
      ? (supabase.from("facility_supplier_access") as any).select("facility_id, supplier_id").eq("supplier_id", supplierId)
      : (supabase.from("facility_supplier_access") as any).select("facility_id, supplier_id"),
    (supabase.from("document_categories") as any).select("label").eq("active", true).order("sort_order"),
    (supabase.from("rule_versions") as any).select("id").eq("status", "published").order("version_number", { ascending: false }).limit(1).maybeSingle()
  ]);

  type DocRow = {
    evidence_status: string | null;
    expiration_date: string | null;
    facility_id: string | null;
    id: string;
    linked_entity_type: string | null;
    original_filename: string | null;
    requirement_item_id: string | null;
    review_notes: string | null;
    title: string;
    document_kind: string;
    uploaded_at: string;
  };

  const documents = (docsRes.data ?? []) as DocRow[];
  const suppliers = (suppliersRes.data ?? []) as Array<{ id: string; company_name: string }>;
  const products = (productsRes.data ?? []) as Array<{ id: string; product_name: string; supplier_id: string | null; facility_id: string | null }>;

  const accessByFacility = new Map<string, string[]>();
  for (const access of (facilityAccessRes.data ?? []) as Array<{ facility_id: string; supplier_id: string }>) {
    const existing = accessByFacility.get(access.facility_id) ?? [];
    existing.push(access.supplier_id);
    accessByFacility.set(access.facility_id, existing);
  }

  const facilities = ((facilitiesRes.data ?? []) as Array<{ id: string; facility_name: string; supplier_id: string | null }>)
    .map((facility) => ({
      ...facility,
      supplier_ids: accessByFacility.get(facility.id) ?? (facility.supplier_id ? [facility.supplier_id] : [])
    }))
    .filter((facility) => !supplierId || facility.supplier_ids.includes(supplierId));

  const documentCategories = ((categoriesRes.data ?? []) as Array<{ label: string }>).map((category) => category.label);
  const pubVersion = pubVersionRes.data as { id: string } | null;
  let requirementItems: Array<{ id: string; item_name: string; section_name: string }> = [];

  if (pubVersion?.id) {
    const { data: rawSections } = await (supabase.from("requirement_sections") as any)
      .select("id, section_name, sort_order")
      .eq("rule_version_id", pubVersion.id)
      .order("sort_order");
    const sectionIds = (rawSections ?? []).map((section: { id: string }) => section.id);
    const { data: rawItems } = sectionIds.length > 0
      ? await (supabase.from("requirement_items") as any)
          .select("id, section_id, item_name")
          .in("section_id", sectionIds)
          .eq("is_required", true)
      : { data: [] };
    const sectionNameById = new Map(
      ((rawSections ?? []) as Array<{ id: string; section_name: string }>).map((section) => [section.id, section.section_name])
    );
    requirementItems = ((rawItems ?? []) as Array<{ id: string; section_id: string; item_name: string }>)
      .map((item) => ({ id: item.id, item_name: item.item_name, section_name: sectionNameById.get(item.section_id) ?? "" }));
  }

  const needsRevision = documents.filter((document) => document.evidence_status === "needs_revision");
  const pendingReview = documents.filter((document) => document.evidence_status === "submitted" || document.evidence_status === "under_review");

  return (
    <AppShell role={role}>
      <SectionHeader
        title="My Evidence"
        description="Upload, store, version, and review documents. Link evidence to Corporate, Facility, or Product requirements from this library."
      />

      <div className="mt-6 space-y-6">
        {needsRevision.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-sm font-semibold text-amber-900">
              {needsRevision.length} document{needsRevision.length !== 1 ? "s" : ""} need revision
            </p>
            <ul className="mt-2 space-y-1">
              {needsRevision.map((document) => (
                <li key={document.id} className="text-sm text-amber-800">
                  <span className="font-medium">{document.title}</span>
                  {document.review_notes ? <span className="text-amber-700"> - {document.review_notes}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <EvidenceUploadPanel
          documentCategories={documentCategories.length > 0 ? documentCategories : undefined}
          facilities={facilities}
          products={products}
          requirementItems={requirementItems}
          requirements={[]}
          suppliers={suppliers}
        />

        {documents.length === 0 ? (
          <EmptyState
            icon={FileArchive}
            title="No documents uploaded yet"
            description="Upload corporate, facility, and product evidence here. The readiness views on those pages will use accepted linked documents."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
            <div className="flex items-center justify-between border-b border-line bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">Stored Documents</h3>
              <span className="text-xs text-slate-500">{pendingReview.length} awaiting review</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Document</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Category</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Linked To</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Submitted</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {documents.map((document) => (
                  <tr key={document.id} className={`transition-colors hover:bg-slate-50 ${document.evidence_status === "needs_revision" ? "bg-amber-50/40" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{document.title}</p>
                      {document.original_filename ? <p className="text-xs text-slate-400">{document.original_filename}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{document.document_kind.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-xs capitalize text-slate-600">
                      {document.linked_entity_type?.replace(/_/g, " ") ?? "Corporate"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(document.uploaded_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={evidenceTone(document.evidence_status)}>
                        {evidenceLabel(document.evidence_status)}
                      </StatusBadge>
                      {document.expiration_date ? (
                        <p className="mt-1 text-xs text-slate-400">Exp: {document.expiration_date}</p>
                      ) : null}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-sm text-slate-600">
                      {document.review_notes ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
