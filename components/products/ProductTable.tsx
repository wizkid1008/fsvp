"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit2, PackageSearch, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Country } from "@/types/database";

type CountryOption = Pick<Country, "country_code" | "country_name">;

type SupplierOption = {
  id: string;
  company_name: string;
};

type FacilityOption = {
  id: string;
  facility_name: string;
  supplier_id?: string | null;
  supplier_ids?: string[];
  country?: string | null;
};

export type ProductRow = {
  id: string;
  product_name: string;
  product_description: string | null;
  country_of_origin: string | null;
  intended_use: string | null;
  raw_or_processed: string | null;
  ingredient_list: string | null;
  allergen_information: string | null;
  supplier_id: string | null;
  facility_id: string | null;
  suppliers: { company_name: string } | null;
  facilities_verify: { facility_name: string } | null;
  evidence_count?: number;
  approval_status?: string;
};

function approvalTone(status?: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "approved") return "success";
  if (status === "conditionally_approved") return "warning";
  if (status === "improvement_required" || status === "not_approved") return "danger";
  return "neutral";
}

const INTENDED_USES = [
  { value: "", label: "Select intended use" },
  { value: "ready_to_eat", label: "Ready to eat" },
  { value: "further_processed", label: "Further processed" },
  { value: "animal_feed", label: "Animal feed" },
  { value: "ingredient", label: "Ingredient" },
  { value: "other", label: "Other" }
];

const PROCESSING_STATES = [
  { value: "", label: "Select processing state" },
  { value: "raw", label: "Raw" },
  { value: "processed", label: "Processed" },
  { value: "both", label: "Both" }
];

const MAJOR_ALLERGENS = [
  "Milk", "Eggs", "Fish", "Crustacean shellfish", "Tree nuts",
  "Peanuts", "Wheat", "Soybeans", "Sesame"
];

const OTHER_ALLERGENS = [
  "Celery", "Mustard", "Lupin", "Molluscs", "Sulphites", "Buckwheat", "Gluten (barley/rye)"
];

function parseAllergens(value: string | null): { selected: string[]; other: string } {
  if (!value) return { selected: [], other: "" };
  const known = new Set([...MAJOR_ALLERGENS, ...OTHER_ALLERGENS]);
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  const selected = parts.filter((p) => known.has(p));
  const other = parts.filter((p) => !known.has(p)).join(", ");
  return { selected, other };
}

function clean(value: FormDataEntryValue | null) {
  const text = value?.toString().trim() ?? "";
  return text || null;
}

function labelize(value: string | null) {
  return value ? value.replace(/_/g, " ") : "-";
}

function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Could not save product.";
}

function AddProductForm({
  countries,
  product,
  onClose,
  facilities,
  suppliers
}: {
  countries: CountryOption[];
  facilities: FacilityOption[];
  product?: ProductRow | null;
  onClose: () => void;
  suppliers: SupplierOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState(product?.supplier_id ?? (suppliers.length === 1 ? suppliers[0]?.id ?? "" : ""));
  const [facilityId, setFacilityId] = useState(product?.facility_id ?? "");
  const [pending, startTransition] = useTransition();
  const supplierFacilities = facilities.filter((facility) => {
    const supplierIds = facility.supplier_ids && facility.supplier_ids.length > 0
      ? facility.supplier_ids
      : facility.supplier_id
        ? [facility.supplier_id]
        : [];
    return supplierIds.includes(supplierId);
  });
  const selectedFacility = facilities.find((facility) => facility.id === facilityId) ?? null;
  const facilityCountry = selectedFacility?.country ?? null;
  const initialAllergens = parseAllergens(product?.allergen_information ?? null);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>(initialAllergens.selected);
  const [otherAllergens, setOtherAllergens] = useState(initialAllergens.other);

  function toggleAllergen(name: string) {
    setSelectedAllergens((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const selectedSupplierId = clean(formData.get("supplier_id"));
        const selectedFacilityId = clean(formData.get("facility_id"));

        if (!selectedSupplierId || !suppliers.some((supplier) => supplier.id === selectedSupplierId)) {
          setError("Select a supplier from the supplier list.");
          return;
        }

        const matchedFacility = facilities.find((facility) => {
          const supplierIds = facility.supplier_ids && facility.supplier_ids.length > 0
            ? facility.supplier_ids
            : facility.supplier_id
              ? [facility.supplier_id]
              : [];
          return facility.id === selectedFacilityId && supplierIds.includes(selectedSupplierId);
        });

        if (!selectedFacilityId || !matchedFacility) {
          setError("Select a facility that is available to the selected supplier.");
          return;
        }

        const country = matchedFacility.country ?? null;
        if (!country) {
          setError("The selected facility has no country set. Add a country to the facility's address before creating a product.");
          return;
        }

        const allergenList = [...selectedAllergens, ...otherAllergens.split(",").map((a) => a.trim()).filter(Boolean)];
        const allergenInformation = allergenList.length > 0 ? allergenList.join(", ") : null;

        const payload = {
          product_name: formData.get("product_name")?.toString().trim() ?? "",
          supplier_id: selectedSupplierId,
          facility_id: selectedFacilityId,
          country_of_origin: country,
          raw_or_processed: clean(formData.get("raw_or_processed")),
          intended_use: clean(formData.get("intended_use")),
          ingredient_list: clean(formData.get("ingredient_list")),
          allergen_information: allergenInformation,
          product_description: clean(formData.get("product_description"))
        };

        const res = await fetch("/api/products/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(product ? { ...payload, id: product.id } : payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not save product.");

        router.refresh();
        onClose();
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  const inputClass = "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
  const textareaClass = "mt-1.5 min-h-20 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest";
  const labelClass = "block text-sm font-medium text-slate-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold text-ink">{product ? "Edit Product" : "Add Product"}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 transition hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Product Name <span className="text-red-500">*</span>
              <input name="product_name" required defaultValue={product?.product_name ?? ""} className={inputClass} placeholder="Mango puree" />
            </label>
            <label className={labelClass}>
              Supplier <span className="text-red-500">*</span>
              <select
                name="supplier_id"
                required
                className={inputClass}
                value={supplierId}
                onChange={(event) => {
                  setSupplierId(event.target.value);
                  setFacilityId("");
                }}
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.company_name}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Facility <span className="text-red-500">*</span>
              <select
                name="facility_id"
                required
                className={inputClass}
                value={facilityId}
                onChange={(event) => setFacilityId(event.target.value)}
                disabled={!supplierId || supplierFacilities.length === 0}
              >
                <option value="">{supplierId ? "Select facility" : "Select supplier first"}</option>
                {supplierFacilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>{facility.facility_name}</option>
                ))}
              </select>
              {supplierId && supplierFacilities.length === 0 ? (
                <span className="mt-1 block text-xs text-amber-700">Add a facility for this supplier before creating a product.</span>
              ) : null}
            </label>
            <label className={labelClass}>
              Country of origin
              <input
                readOnly
                disabled
                value={facilityCountry ?? (facilityId ? "Facility has no country set" : "Select a facility first")}
                className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-600`}
              />
              <span className="mt-1 block text-xs text-slate-400">Inherited from the selected facility.</span>
            </label>
            <label className={labelClass}>
              Intended Use
              <select name="intended_use" className={inputClass} defaultValue={product?.intended_use ?? ""}>
                {INTENDED_USES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Processing State
              <select name="raw_or_processed" className={inputClass} defaultValue={product?.raw_or_processed ?? ""}>
                {PROCESSING_STATES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <p className={labelClass}>Allergens — FDA Major Allergens</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {MAJOR_ALLERGENS.map((allergen) => (
                <label key={allergen} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedAllergens.includes(allergen)}
                    onChange={() => toggleAllergen(allergen)}
                    className="h-4 w-4 rounded border-line text-forest focus:ring-forest"
                  />
                  {allergen}
                </label>
              ))}
            </div>
            <p className={`${labelClass} mt-3`}>Other Regulated Allergens</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {OTHER_ALLERGENS.map((allergen) => (
                <label key={allergen} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedAllergens.includes(allergen)}
                    onChange={() => toggleAllergen(allergen)}
                    className="h-4 w-4 rounded border-line text-forest focus:ring-forest"
                  />
                  {allergen}
                </label>
              ))}
            </div>
            <label className={`${labelClass} mt-3 block`}>
              Other (comma-separated, not listed above)
              <input
                value={otherAllergens}
                onChange={(e) => setOtherAllergens(e.target.value)}
                className={inputClass}
                placeholder="e.g. coconut"
              />
            </label>
          </div>

          <label className={labelClass}>
            Ingredients
            <textarea name="ingredient_list" defaultValue={product?.ingredient_list ?? ""} className={textareaClass} placeholder="Ingredient list or short description" />
          </label>
          <label className={labelClass}>
            Product Description
            <textarea name="product_description" defaultValue={product?.product_description ?? ""} className={textareaClass} placeholder="Optional product notes" />
          </label>

          {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              Cancel
            </button>
            <button disabled={pending} className="h-10 rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60">
              {pending ? "Saving..." : product ? "Save product" : "Add product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProductTable({
  countries,
  facilities,
  products,
  supplierHref = "/suppliers",
  suppliers
}: {
  countries: CountryOption[];
  facilities: FacilityOption[];
  products: ProductRow[];
  supplierHref?: string;
  suppliers: SupplierOption[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const canAddProduct = suppliers.length > 0 && facilities.length > 0;

  function openAddForm() {
    setEditingProduct(null);
    setShowForm(true);
  }

  function openEditForm(product: ProductRow) {
    setEditingProduct(product);
    setShowForm(true);
  }

  return (
    <>
      {showForm ? (
        <AddProductForm
          countries={countries}
          facilities={facilities}
          onClose={() => setShowForm(false)}
          product={editingProduct}
          suppliers={suppliers}
        />
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={!canAddProduct}
          onClick={openAddForm}
          className="inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          Add product
        </button>
      </div>

      {products.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-slate-50 px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-white shadow-soft">
            <PackageSearch className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">No products yet</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
            {canAddProduct
              ? "Add products under a supplier facility, then map FSVP requirements and verification evidence."
              : "Add a supplier and facility first, then create products under that facility."}
          </p>
          {canAddProduct ? (
            <button
              type="button"
              onClick={openAddForm}
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
            >
              Add your first product
            </button>
          ) : (
            <a
              href={suppliers.length === 0 ? supplierHref : "/facilities"}
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
            >
              {suppliers.length === 0 ? "Add a supplier first" : "Add a facility first"}
            </a>
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Product</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Facility</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Origin</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Intended Use</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Allergens</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Evidence</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((product) => (
                <tr key={product.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-ink">
                    <a href={`/products/${product.id}`} className="text-forest hover:underline">
                      {product.product_name}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={approvalTone(product.approval_status)}>
                      {labelize(product.approval_status ?? "pending")}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{product.suppliers?.company_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{product.facilities_verify?.facility_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{product.country_of_origin ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{labelize(product.intended_use)}</td>
                  <td className="px-4 py-3 text-slate-600">{product.allergen_information ?? "None declared"}</td>
                  <td className="px-4 py-3">
                    <a
                      href={`/evidence?entity=product&id=${product.id}`}
                      className="font-semibold text-forest hover:underline"
                    >
                      {product.evidence_count ?? 0} documents
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openEditForm(product)}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-semibold text-slate-600 transition hover:border-forest hover:text-forest"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
