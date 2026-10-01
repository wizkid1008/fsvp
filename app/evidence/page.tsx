import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { EvidenceUploadPanel } from "@/components/evidence/EvidenceUploadPanel";
import { DocumentActions } from "@/components/evidence/DocumentActions";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { FileArchive } from "lucide-react";
import Link from "next/link";
import { CompanyRecords, loadCompanyRecords } from "@/components/evidence/CompanyRecords";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { ExporterSubmissions } from "@/components/evidence/ExporterSubmissions";
import { ConfigurationNotice } from "@/components/ui/ConfigurationNotice";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import { countPendingReview } from "@/lib/evidence/review-queue";
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
  searchParams?: { entity?: string; id?: string; tab?: string };
}) {
  const { role, realRole, user } = await requireProfileRole("/evidence");
  const supabase = createServerSupabaseClient();

  // The Company records tab holds the importer's own documents (formerly the
  // Our FSVP Records page). An administrator sees the previewed importer's.
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("importer_id")
    .eq("id", user.id)
    .maybeSingle();
  const importerId: string | null = resolvePreviewedAccountId(realRole, profile?.importer_id ?? null);
  const companyRecords = importerId ? await loadCompanyRecords(supabase as any, importerId) : null;

  // Exporter submissions (formerly /importer-review) read through the admin
  // client, scoped by hand to the importer's exporters — see
  // lib/evidence/review-queue.ts. An administrator not previewing sees all.
  const adminResult = tryAdminClient();
  const reviewScope = role === "us_importer" ? importerId : null;
  const pendingReview = adminResult.ok ? await countPendingReview(adminResult.client, reviewScope) : 0;

  const tab =
    searchParams?.tab === "company" && companyRecords ? "company"
    : searchParams?.tab === "submissions" ? "submissions"
    : "suppliers";

  type DocRow = { id: string; importer_id: string; title: string; document_kind: string; original_filename: string | null; uploaded_at: string; approval_status: string | null; size_bytes: number; linked_entity_type: string | null; linked_entity_id: string | null; requirement_item_id: string | null };
  // Sections carry their items. The library files evidence against the same
  // published rule version the scoring engine reads, so a document that counts
  // here counts toward the score too — the two used to answer from different
  // models, which is what migration 023 retired.
  type SectionRow = {
    id: string;
    section_name: string;
    applies_to: string;
    sort_order: number;
    requirement_items: Array<{ id: string; item_name: string; sort_order: number }> | null;
  };
  type SupplierRow = { id: string; company_name: string };
  type ProductRow = { id: string; product_name: string; supplier_id: string | null; facility_id: string | null };
  type FacilityRow = { id: string; facility_name: string; supplier_id: string | null; supplier_ids?: string[] };
  type CategoryRow = { label: string };

  // The published rule version, resolved the same way lib/readiness/supplier-score.ts
  // resolves it. Nothing to file against if no version is published.
  const { data: publishedVersion } = await (supabase.from("rule_versions") as any)
    .select("id")
    .eq("status", "published")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [docsRes, sectionsRes, suppliersRes, productsRes, facilitiesRes, facilityAccessRes, categoriesRes] = await Promise.all([
    supabase.from("documents").select("id, importer_id, title, document_kind, original_filename, uploaded_at, approval_status, size_bytes, linked_entity_type, linked_entity_id, requirement_item_id").is("soft_deleted_at", null).order("uploaded_at", { ascending: false }),
    publishedVersion?.id
      ? (supabase.from("requirement_sections") as any)
          .select("id, section_name, applies_to, sort_order, requirement_items(id, item_name, sort_order)")
          .eq("rule_version_id", publishedVersion.id)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
    (supabase.from("suppliers") as any).select("id, company_name").order("company_name"),
    (supabase.from("products_verify") as any).select("id, product_name, supplier_id, facility_id").order("product_name"),
    (supabase.from("facilities_verify") as any).select("id, facility_name, supplier_id").order("facility_name"),
    (supabase.from("facility_supplier_access") as any).select("facility_id, supplier_id").order("created_at"),
    (supabase.from("document_categories") as any).select("label").eq("active", true).order("sort_order"),
  ]);

  // The importer's own documents are listed on the Company records tab, by
  // obligation, not here — this table is evidence about suppliers.
  const documents = ((docsRes.data ?? []) as unknown as DocRow[]).filter(
    (doc) => doc.linked_entity_type !== "importer"
  );
  const sections = (sectionsRes.data ?? []) as unknown as SectionRow[];
  // Flattened for the two dropdowns: one option per item, labelled by its
  // section so "Recall Procedure" is distinguishable from the supplier-level
  // "Recall Plan". applies_to rides along so the edit dialog can narrow the
  // list to the entity the document is actually linked to.
  const requirementItems = sections.flatMap((section) =>
    (section.requirement_items ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => ({
        id: item.id,
        item_name: item.item_name,
        section_name: section.section_name,
        applies_to: section.applies_to,
      }))
  );
  const requirementItemById = new Map(requirementItems.map((item) => [item.id, item]));
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
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Document Library"
        description="Every FSVP document you hold: evidence about your exporters, facilities and products, what your exporters have submitted for your review, and your company's own FSVP records."
      />

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-line" aria-label="Document Library sections">
          {[
            { key: "suppliers", label: "Supplier & product documents", href: "/evidence", badge: null as string | null },
            {
              key: "submissions",
              label: "Exporter submissions",
              href: "/evidence?tab=submissions",
              badge: pendingReview > 0 ? `${pendingReview} to review` : null,
            },
            ...(companyRecords
              ? [{
                  key: "company",
                  label: "Company records",
                  href: "/evidence?tab=company",
                  badge: companyRecords.outstanding > 0 ? `${companyRecords.outstanding} needed` : null,
                }]
              : []),
          ].map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={tab === t.key ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                tab === t.key
                  ? "border-forest text-ink"
                  : "border-transparent text-slate-500 hover:text-ink"
              }`}
            >
              {t.label}
              {t.badge && <StatusBadge tone="warning">{t.badge}</StatusBadge>}
            </Link>
          ))}
      </nav>

      {tab === "submissions" ? (
        <div className="mt-6">
          {adminResult.ok ? (
            <ExporterSubmissions admin={adminResult.client} importerId={reviewScope} />
          ) : (
            <ConfigurationNotice message={adminResult.message} />
          )}
        </div>
      ) : tab === "company" && companyRecords && importerId ? (
        <div className="mt-6">
          <CompanyRecords
            data={companyRecords}
            importerId={importerId}
            isAdministrator={realRole === "administrator"}
          />
        </div>
      ) : (
      <div className="mt-6">
        {/* No requirements sidebar: it listed every section of the rule with a
            fixed status dot, tied to no exporter, facility or product. Their
            pages' checklists show the same requirements with real status. */}
        <div className="space-y-6">
          <EvidenceUploadPanel
            documentCategories={documentCategories.length > 0 ? documentCategories : undefined}
            facilities={facilities}
            products={products}
            requirementItems={requirementItems}
            suppliers={suppliers}
            presetSupplierId={filterEntity === "supplier" && filterId ? filterId : null}
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
                      <td className="px-4 py-3 text-slate-600">{doc.requirement_item_id ? requirementItemById.get(doc.requirement_item_id)?.item_name ?? "Mapped" : "-"}</td>
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
                          requirementItems={requirementItems}
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

      </div>
      )}
    </AppShell>
  );
}
