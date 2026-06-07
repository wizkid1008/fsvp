"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const DOCUMENT_CATEGORIES = [
  "Food Safety Plan", "HACCP Plan", "Certificate of Analysis", "Audit Report",
  "GMP Certification", "FDA Registration", "Recall Record", "Traceability Record",
  "Supplier Questionnaire", "Product Specification", "Allergen Control Program",
  "Environmental Monitoring", "Corrective Action Report", "Laboratory Testing Report",
  "Training Record", "Other",
];

type SupplierOption = {
  id: string;
  company_name: string;
};

type ProductOption = {
  id: string;
  product_name: string;
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

export function EvidenceUploadPanel({
  documentCategories = DOCUMENT_CATEGORIES,
  facilities = [],
  products = [],
  requirements = [],
  suppliers = []
}: {
  documentCategories?: string[];
  facilities?: FacilityOption[];
  products?: ProductOption[];
  requirements?: RequirementOption[];
  suppliers?: SupplierOption[];
}) {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [supplierId, setSupplierId] = useState(suppliers.length === 1 ? suppliers[0]?.id ?? "" : "");
  const [linkType, setLinkType] = useState<"supplier" | "product" | "facility">("supplier");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supplierProducts = products.filter((product) => product.supplier_id === supplierId);
  const supplierFacilities = facilities.filter((facility) => facility.supplier_id === supplierId);

  function handleFiles(files: FileList | null) {
    if (files?.[0]) setFile(files[0]);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setError(null);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const title = formData.get("title")?.toString().trim() || file.name;
    const category = formData.get("category")?.toString() ?? "Other";
    const selectedSupplierId = formData.get("supplier_id")?.toString() ?? "";
    const selectedLinkType = formData.get("link_type")?.toString() ?? "supplier";
    const productId = selectedLinkType === "product" ? formData.get("product_id")?.toString() ?? "" : "";
    const facilityId = selectedLinkType === "facility" ? formData.get("facility_id")?.toString() ?? "" : "";
    const requirementId = formData.get("related_requirement_id")?.toString() ?? "";

    if (!selectedSupplierId) {
      setError("Select the supplier this evidence belongs to.");
      return;
    }
    if (selectedLinkType === "product" && !productId) {
      setError("Select a product or switch the link type to supplier-wide evidence.");
      return;
    }
    if (selectedLinkType === "facility" && !facilityId) {
      setError("Select a facility or switch the link type to supplier-wide evidence.");
      return;
    }

    startTransition(async () => {
      try {
        // Fetch user's importer_id from their profile
        const supabase = createBrowserSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated.");

        const { data: profile } = await (supabase.from("profiles") as any)
          .select("importer_id")
          .eq("id", user.id)
          .maybeSingle();

        if (!profile?.importer_id) {
          throw new Error("Your account is not linked to an importer organization. Ask your administrator to link your account before uploading documents.");
        }

        const body = new FormData();
        body.append("file", file);
        body.append("title", title);
        body.append("document_kind", category);
        body.append("importer_id", profile.importer_id);
        body.append("supplier_id", selectedSupplierId);
        body.append("link_type", selectedLinkType);
        if (productId) body.append("product_id", productId);
        if (facilityId) body.append("facility_id", facilityId);
        if (requirementId) body.append("related_requirement_id", requirementId);

        const res = await fetch("/api/documents/upload", { method: "POST", body });
        const json = await res.json() as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Upload failed.");

        setMessage("Document uploaded successfully.");
        setFile(null);
        setLinkType("supplier");
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <h3 className="text-sm font-semibold text-ink">Upload Evidence</h3>
      <p className="mt-1 text-xs text-slate-500">PDF, Word, Excel, or image files up to 50 MB</p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 transition ${
            dragging ? "border-forest bg-emerald-50" : "border-line hover:border-forest hover:bg-slate-50"
          }`}
        >
          {file ? (
            <>
              <FileText className="h-8 w-8 text-forest" />
              <p className="mt-2 text-sm font-medium text-ink">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">Drop file here or click to browse</p>
            </>
          )}
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>

        {file && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Document Title
              <input
                name="title"
                defaultValue={file.name.replace(/\.[^.]+$/, "")}
                className="mt-1.5 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-forest"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Category
              <select name="category" className="mt-1.5 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-forest bg-white">
                {documentCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Supplier <span className="text-red-500">*</span>
              <select
                name="supplier_id"
                required
                value={supplierId}
                onChange={(event) => {
                  setSupplierId(event.target.value);
                  setLinkType("supplier");
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
              <select name="related_requirement_id" className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest">
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
            {linkType === "product" ? (
              <label className="block text-sm font-medium text-slate-700">
                Product <span className="text-red-500">*</span>
                <select name="product_id" required className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest">
                  <option value="">Select product</option>
                  {supplierProducts.map((product) => (
                    <option key={product.id} value={product.id}>{product.product_name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {linkType === "facility" ? (
              <label className="block text-sm font-medium text-slate-700">
                Facility <span className="text-red-500">*</span>
                <select name="facility_id" required className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest">
                  <option value="">Select facility</option>
                  {supplierFacilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>{facility.facility_name}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        )}

        {file && suppliers.length === 0 ? (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            Add a supplier before uploading evidence. Evidence must be tied to a supplier record.
          </p>
        ) : null}

        {message && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {file && (
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setFile(null)} className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Clear
            </button>
            <button
              disabled={pending || suppliers.length === 0}
              className="h-10 rounded-md bg-forest px-5 text-sm font-semibold text-white hover:bg-[#195f4d] disabled:opacity-60"
            >
              {pending ? "Uploading..." : "Upload document"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
