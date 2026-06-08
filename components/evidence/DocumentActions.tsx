"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit2, Trash2, X } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type SupplierOption = {
  id: string;
  company_name: string;
};

type ProductOption = {
  id: string;
  product_name: string;
  facility_id?: string | null;
  supplier_id: string | null;
};

type FacilityOption = {
  id: string;
  facility_name: string;
  supplier_id: string | null;
};

type RequirementOption = {
  id: string;
  requirement_name: string;
};

export type EditableDocument = {
  id: string;
  importer_id: string;
  title: string;
  document_kind: string;
  approval_status: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  related_requirement_id: string | null;
};

const REVIEW_STATUSES = [
  { value: "uploaded", label: "Uploaded" },
  { value: "under_review", label: "Under Review" },
  { value: "accepted", label: "Accepted" },
  { value: "complete", label: "Complete" },
  { value: "revision_required", label: "Revision Required" },
  { value: "rejected", label: "Rejected" }
];

function clean(value: FormDataEntryValue | null) {
  const text = value?.toString().trim() ?? "";
  return text || null;
}

function getInitialLinkState(
  document: EditableDocument,
  products: ProductOption[],
  facilities: FacilityOption[]
) {
  if (document.linked_entity_type === "product" && document.linked_entity_id) {
    const product = products.find((item) => item.id === document.linked_entity_id);
    return {
      linkType: "product" as const,
      supplierId: product?.supplier_id ?? "",
      productId: document.linked_entity_id,
      facilityId: ""
    };
  }

  if (document.linked_entity_type === "facility" && document.linked_entity_id) {
    const facility = facilities.find((item) => item.id === document.linked_entity_id);
    return {
      linkType: "facility" as const,
      supplierId: facility?.supplier_id ?? "",
      productId: "",
      facilityId: document.linked_entity_id
    };
  }

  return {
    linkType: "supplier" as const,
    supplierId: document.linked_entity_id ?? "",
    productId: "",
    facilityId: ""
  };
}

export function DocumentActions({
  canEditReviewStatus = false,
  document,
  documentCategories,
  facilities,
  products,
  requirements,
  suppliers
}: {
  canEditReviewStatus?: boolean;
  document: EditableDocument;
  documentCategories: string[];
  facilities: FacilityOption[];
  products: ProductOption[];
  requirements: RequirementOption[];
  suppliers: SupplierOption[];
}) {
  const router = useRouter();
  const initialLinkState = getInitialLinkState(document, products, facilities);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removing, startRemoveTransition] = useTransition();
  const [supplierId, setSupplierId] = useState(initialLinkState.supplierId);
  const [linkType, setLinkType] = useState<"supplier" | "product" | "facility">(initialLinkState.linkType);
  const [productId, setProductId] = useState(initialLinkState.productId);
  const [facilityId, setFacilityId] = useState(initialLinkState.facilityId);
  const categoryOptions = Array.from(new Set([document.document_kind, ...documentCategories].filter(Boolean)));
  const supplierProducts = products.filter((product) => product.supplier_id === supplierId);
  const supplierFacilities = facilities.filter((facility) => facility.supplier_id === supplierId);

  function resetAndClose() {
    setError(null);
    setEditing(false);
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const title = formData.get("title")?.toString().trim() ?? "";
        const documentKind = formData.get("document_kind")?.toString().trim() ?? "";
        const requirementId = clean(formData.get("related_requirement_id"));
        const selectedSupplierId = clean(formData.get("supplier_id"));
        const selectedLinkType = formData.get("link_type")?.toString() ?? "supplier";
        const selectedProductId = selectedLinkType === "product" ? clean(formData.get("product_id")) : null;
        const selectedFacilityId = selectedLinkType === "facility" ? clean(formData.get("facility_id")) : null;

        if (!title) {
          setError("Document title is required.");
          return;
        }

        if (!documentKind) {
          setError("Select a document category.");
          return;
        }

        if (!selectedSupplierId || !suppliers.some((supplier) => supplier.id === selectedSupplierId)) {
          setError("Select the supplier this evidence belongs to.");
          return;
        }

        if (selectedLinkType === "product" && (!selectedProductId || !supplierProducts.some((product) => product.id === selectedProductId))) {
          setError("Select a product that belongs to the selected supplier.");
          return;
        }

        if (selectedLinkType === "facility" && (!selectedFacilityId || !supplierFacilities.some((facility) => facility.id === selectedFacilityId))) {
          setError("Select a facility that belongs to the selected supplier.");
          return;
        }

        const linkedEntityType = selectedLinkType;
        const linkedEntityId = selectedLinkType === "product"
          ? selectedProductId
          : selectedLinkType === "facility"
            ? selectedFacilityId
            : selectedSupplierId;

        const product = selectedProductId ? products.find((item) => item.id === selectedProductId) : null;
        const facility = selectedFacilityId ? facilities.find((item) => item.id === selectedFacilityId) : null;
        const facilityForProduct = product?.facility_id ? facilities.find((item) => item.id === product.facility_id) : null;

        const supabase = createBrowserSupabaseClient();
        const approvalStatus = canEditReviewStatus ? clean(formData.get("approval_status")) ?? "uploaded" : document.approval_status ?? "uploaded";
        const payload = {
          title,
          document_kind: documentKind,
          linked_entity_type: linkedEntityType,
          linked_entity_id: linkedEntityId,
          related_requirement_id: requirementId,
          ...(canEditReviewStatus ? { approval_status: approvalStatus } : {})
        };

        const { error: documentError } = await (supabase.from("documents") as any)
          .update(payload)
          .eq("id", document.id);

        if (documentError) throw documentError;

        await (supabase.from("requirement_evidence") as any)
          .delete()
          .eq("document_id", document.id);

        if (requirementId) {
          const { error: evidenceError } = await (supabase.from("requirement_evidence") as any).insert({
            importer_id: document.importer_id,
            supplier_id: selectedSupplierId,
            product_id: linkedEntityType === "product" ? linkedEntityId : null,
            facility_id: linkedEntityType === "facility" ? linkedEntityId : (facilityForProduct?.id ?? facility?.id ?? null),
            requirement_id: requirementId,
            document_id: document.id,
            status: approvalStatus
          });

          if (evidenceError) throw evidenceError;
        }

        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (user) {
          await (supabase.from("audit_logs") as any).insert({
            importer_id: document.importer_id,
            actor_profile_id: user.id,
            action: "document_updated",
            record_type: "documents",
            record_id: document.id,
            new_value: payload
          });
        }

        router.refresh();
        resetAndClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save document changes.");
      }
    });
  }

  function removeDocument() {
    if (!window.confirm("Remove this document from active evidence? The record will be hidden from working dashboards but retained for audit history.")) {
      return;
    }

    startRemoveTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const deletedAt = new Date().toISOString();
        const { error: documentError } = await (supabase.from("documents") as any)
          .update({ soft_deleted_at: deletedAt })
          .eq("id", document.id);

        if (documentError) throw documentError;

        await (supabase.from("requirement_evidence") as any)
          .delete()
          .eq("document_id", document.id);

        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (user) {
          await (supabase.from("audit_logs") as any).insert({
            importer_id: document.importer_id,
            actor_profile_id: user.id,
            action: "document_removed",
            record_type: "documents",
            record_id: document.id,
            new_value: { soft_deleted_at: deletedAt }
          });
        }

        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove document.");
        setEditing(true);
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-semibold text-slate-600 transition hover:border-forest hover:text-forest"
        >
          <Edit2 className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          type="button"
          disabled={removing}
          onClick={removeDocument}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 px-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-lg font-semibold text-ink">Edit document</h2>
              <button type="button" onClick={resetAndClose} className="rounded p-1 transition hover:bg-slate-100">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={save} className="space-y-4 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Document Title
                  <input
                    name="title"
                    required
                    defaultValue={document.title}
                    className="mt-1.5 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-forest"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Category
                  <select
                    name="document_kind"
                    defaultValue={document.document_kind}
                    className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
                  >
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Supplier
                  <select
                    name="supplier_id"
                    required
                    value={supplierId}
                    onChange={(event) => {
                      setSupplierId(event.target.value);
                      setLinkType("supplier");
                      setProductId("");
                      setFacilityId("");
                    }}
                    className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>{supplier.company_name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  FSVP Requirement
                  <select
                    name="related_requirement_id"
                    defaultValue={document.related_requirement_id ?? ""}
                    className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
                  >
                    <option value="">Not mapped yet</option>
                    {requirements.map((requirement) => (
                      <option key={requirement.id} value={requirement.id}>{requirement.requirement_name}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Link Evidence To
                  <select
                    name="link_type"
                    value={linkType}
                    onChange={(event) => setLinkType(event.target.value as "supplier" | "product" | "facility")}
                    className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
                  >
                    <option value="supplier">Supplier-wide evidence</option>
                    <option value="product" disabled={!supplierId || supplierProducts.length === 0}>Specific product</option>
                    <option value="facility" disabled={!supplierId || supplierFacilities.length === 0}>Specific facility</option>
                  </select>
                </label>
                {canEditReviewStatus ? (
                  <label className="block text-sm font-medium text-slate-700">
                    Review Status
                    <select
                      name="approval_status"
                      defaultValue={document.approval_status ?? "uploaded"}
                      className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
                    >
                      {REVIEW_STATUSES.map((status) => (
                        <option key={status.value} value={status.value}>{status.label}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {linkType === "product" ? (
                  <label className="block text-sm font-medium text-slate-700">
                    Product
                    <select
                      name="product_id"
                      required
                      value={productId}
                      onChange={(event) => setProductId(event.target.value)}
                      className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
                    >
                      <option value="">Select product</option>
                      {supplierProducts.map((product) => (
                        <option key={product.id} value={product.id}>{product.product_name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {linkType === "facility" ? (
                  <label className="block text-sm font-medium text-slate-700">
                    Facility
                    <select
                      name="facility_id"
                      required
                      value={facilityId}
                      onChange={(event) => setFacilityId(event.target.value)}
                      className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
                    >
                      <option value="">Select facility</option>
                      {supplierFacilities.map((facility) => (
                        <option key={facility.id} value={facility.id}>{facility.facility_name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>

              {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

              <div className="flex justify-end gap-3 border-t border-line pt-4">
                <button type="button" onClick={resetAndClose} className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                  Cancel
                </button>
                <button disabled={pending} className="h-10 rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60">
                  {pending ? "Saving..." : "Save document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
