import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { EvidenceUploadPanel } from "@/components/evidence/EvidenceUploadPanel";
import { DocumentActions } from "@/components/evidence/DocumentActions";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { FileArchive } from "lucide-react";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function approvalTone(status: string | null): StatusTone {
  if (status === "accepted" || status === "complete") return "success";
  if (status === "under_review") return "info";
  if (status === "revision_required" || status === "rejected") return "danger";
  if (status === "uploaded") return "warning";
  return "neutral";
}

function approvalLabel(status: string | null) {
  if (!status) return "Uploaded";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function EvidencePage({
  searchParams
}: {
  searchParams?: { entity?: string; id?: string };
}) {
  const { role } = await requireProfileRole("/evidence");
  const supabase = createServerSupabaseClient();

  type DocRow = { id: string; importer_id: string; title: string; document_kind: string; original_filename: string | null; uploaded_at: string; approval_status: string | null; size_bytes: number; linked_entity_type: string | null; linked_entity_id: string | null; related_requirement_id: string | null };
  type ReqRow = { id: string; requirement_name: string; requirement_key: string; sort_order: number };
  type SupplierRow = { id: string; company_name: string };
  type ProductRow = { id: string; product_name: string; supplier_id: string | null; facility_id: string | null };
  type FacilityRow = { id: string; facility_name: string; supplier_id: string | null; supplier_ids?: string[] };
  type CategoryRow = { label: string };

  const [docsRes, reqsRes, suppliersRes, productsRes, facilitiesRes, facilityAccessRes, categoriesRes] = await Promise.all([
    supabase.from("documents").select("id, importer_id, title, document_kind, original_filename, uploaded_at, approval_status, size_bytes, linked_entity_type, linked_entity_id, related_requirement_id").is("soft_deleted_at", null).order("uploaded_at", { ascending: false }),
    supabase.from("fsvp_requirements").select("id, requirement_name, requirement_key, sort_order").eq("active", true).order("sort_order"),
    (supabase.from("suppliers") as any).select("id, company_name").order("company_name"),
    (supabase.from("products_verify") as any).select("id, product_name, supplier_id, facility_id").order("product_name"),
    (supabase.from("facilities_verify") as any).select("id, facility_name, supplier_id").order("facility_name"),
    (supabase.from("facility_supplier_access") as any).select("facility_id, supplier_id").order("created_at"),
    (supabase.from("document_categories") as any).select("label").eq("active", true).order("sort_order"),
  ]);

  const documents = (docsRes.data ?? []) as unknown as DocRow[];
  const requirements = (reqsRes.data ?? []) as unknown as ReqRow[];
  const suppliers = (suppliersRes.data ?? []) as SupplierRow[];
  const products = (productsRes.data ?? []) as ProductRow[];
  const accessByFacility = new Map<string, string[]>();
  for (const access of (facilityAccessRes.data ?? []) as Array<{ facility_id: string; supplier_id: string }>) {
    const existing = accessByFacility.get(access.facility_id) ?? [];
    existing.push(access.supplier_id);
    accessByFacility.set(access.facility_id, existing);
  }
  const facilities = ((facilitiesRes.data ?? []) as FacilityRow[]).map((facility) => ({
    ...facility,
    supplier_ids: accessByFacility.get(facility.id) ?? (facility.supplier_id ? [facility.supplier_id] : [])
  }));
  const documentCategories = ((categoriesRes.data ?? []) as CategoryRow[]).map((category) => category.label);
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));
  const requirementById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const filterEntity = searchParams?.entity ?? "";
  const filterId = searchParams?.id ?? "";

  function linkedLabel(doc: DocRow) {
    if (doc.linked_entity_type === "product" && doc.linked_entity_id) {
      const product = productById.get(doc.linked_entity_id);
      const supplier = product?.supplier_id ? supplierById.get(product.supplier_id) : null;
      return product ? `${supplier?.company_name ?? "Supplier"} / Product: ${product.product_name}` : "Product evidence";
    }

    if (doc.linked_entity_type === "facility" && doc.linked_entity_id) {
      const facility = facilityById.get(doc.linked_entity_id);
      const supplierNames = (facility?.supplier_ids ?? []).map((id) => supplierById.get(id)?.company_name).filter(Boolean);
      return facility ? `${supplierNames.join(", ") || "Supplier"} / Facility: ${facility.facility_name}` : "Facility evidence";
    }

    if (doc.linked_entity_id) {
      return supplierById.get(doc.linked_entity_id)?.company_name ?? "Supplier evidence";
    }

    return "Unlinked";
  }

  function matchesFilter(doc: DocRow) {
    if (!filterEntity || !filterId) return true;

    if (filterEntity === "product") {
      return doc.linked_entity_type === "product" && doc.linked_entity_id === filterId;
    }

    if (filterEntity === "facility") {
      return doc.linked_entity_type === "facility" && doc.linked_entity_id === filterId;
    }

    if (filterEntity === "supplier") {
      if (doc.linked_entity_id === filterId && (doc.linked_entity_type === "supplier" || doc.linked_entity_type === "foreign_supplier")) {
        return true;
      }

      if (doc.linked_entity_type === "product" && doc.linked_entity_id) {
        return productById.get(doc.linked_entity_id)?.supplier_id === filterId;
      }

      if (doc.linked_entity_type === "facility" && doc.linked_entity_id) {
        return facilityById.get(doc.linked_entity_id)?.supplier_ids?.includes(filterId) ?? false;
      }
    }

    return true;
  }

  function filterLabel() {
    if (!filterEntity || !filterId) return null;
    if (filterEntity === "supplier") return supplierById.get(filterId)?.company_name ?? "Selected supplier";
    if (filterEntity === "product") return productById.get(filterId)?.product_name ?? "Selected product";
    if (filterEntity === "facility") return facilityById.get(filterId)?.facility_name ?? "Selected facility";
    return null;
  }

  const visibleDocuments = documents.filter(matchesFilter);
  const activeFilterLabel = filterLabel();

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Evidence"
        description="Upload and manage FSVP evidence documents, track review status, and map each document to its regulatory requirement."
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <EvidenceUploadPanel
            documentCategories={documentCategories.length > 0 ? documentCategories : undefined}
            facilities={facilities}
            products={products}
            requirements={requirements}
            suppliers={suppliers}
          />

          {activeFilterLabel ? (
            <div className="flex items-center justify-between rounded-lg border border-line bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-700">Showing evidence for {activeFilterLabel}</p>
              <a href="/evidence" className="text-sm font-semibold text-forest hover:underline">Clear filter</a>
            </div>
          ) : null}

          {!visibleDocuments || visibleDocuments.length === 0 ? (
            <EmptyState
              icon={FileArchive}
              title="No documents uploaded"
              description="Upload your first FSVP evidence document: COAs, audit reports, supplier questionnaires, hazard analyses, and more."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
              <div className="border-b border-line bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-700">Uploaded Documents</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-slate-50/50">
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Document</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Category</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Linked To</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Requirement</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Uploaded</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Status</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visibleDocuments.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{doc.title}</p>
                        {doc.original_filename && <p className="text-xs text-slate-400">{doc.original_filename}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 capitalize">{doc.document_kind.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-slate-600">{linkedLabel(doc)}</td>
                      <td className="px-4 py-3 text-slate-600">{doc.related_requirement_id ? requirementById.get(doc.related_requirement_id)?.requirement_name ?? "Mapped" : "-"}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(doc.uploaded_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={approvalTone(doc.approval_status)}>
                          {approvalLabel(doc.approval_status)}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <DocumentActions
                          canEditReviewStatus={role !== "supplier"}
                          document={doc}
                          documentCategories={documentCategories}
                          facilities={facilities}
                          products={products}
                          requirements={requirements}
                          suppliers={suppliers}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <h3 className="text-sm font-semibold text-ink">FSVP Requirements</h3>
            <p className="mt-1 text-xs text-slate-500">Evidence needed per 21 CFR Part 1, Subpart L</p>
            <div className="mt-4 space-y-2">
              {(requirements ?? []).map((req) => (
                <div key={req.id} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                  <span className="text-xs font-medium text-slate-700">{req.requirement_name}</span>
                </div>
              ))}
              {(!requirements || requirements.length === 0) && (
                <p className="text-xs text-slate-400">Requirements not loaded.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
