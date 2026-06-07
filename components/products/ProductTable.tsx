"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit2, PackageSearch, X } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { CountryCombobox } from "@/components/profile/CountryCombobox";
import type { Country } from "@/types/database";

type CountryOption = Pick<Country, "country_code" | "country_name">;

type SupplierOption = {
  id: string;
  company_name: string;
};

type FacilityOption = {
  id: string;
  facility_name: string;
  supplier_id: string | null;
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
};

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

function clean(value: FormDataEntryValue | null) {
  const text = value?.toString().trim() ?? "";
  return text || null;
}

function labelize(value: string | null) {
  return value ? value.replace(/_/g, " ") : "-";
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
  const supplierFacilities = facilities.filter((facility) => facility.supplier_id === supplierId);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const country = clean(formData.get("country_of_origin"));

        if (!country || !countries.some((option) => option.country_name.toLowerCase() === country.toLowerCase())) {
          setError("Select a country of origin from the dropdown list.");
          return;
        }

        const selectedSupplierId = clean(formData.get("supplier_id"));
        const selectedFacilityId = clean(formData.get("facility_id"));

        if (!selectedSupplierId || !suppliers.some((supplier) => supplier.id === selectedSupplierId)) {
          setError("Select a supplier from the supplier list.");
          return;
        }

        if (!selectedFacilityId || !facilities.some((facility) => facility.id === selectedFacilityId && facility.supplier_id === selectedSupplierId)) {
          setError("Select a facility that belongs to the selected supplier.");
          return;
        }

        const payload = {
          product_name: formData.get("product_name")?.toString().trim() ?? "",
          supplier_id: selectedSupplierId,
          facility_id: selectedFacilityId,
          country_of_origin: country,
          raw_or_processed: clean(formData.get("raw_or_processed")),
          intended_use: clean(formData.get("intended_use")),
          ingredient_list: clean(formData.get("ingredient_list")),
          allergen_information: clean(formData.get("allergen_information")),
          product_description: clean(formData.get("product_description"))
        };
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        const { data: profile } = user
          ? await (supabase.from("profiles") as any)
              .select("importer_id")
              .eq("id", user.id)
              .maybeSingle()
          : { data: null };
        const savePayload = profile?.importer_id
          ? { ...payload, importer_id: profile.importer_id }
          : payload;
        const { error: saveError } = product
          ? await (supabase.from("products_verify") as any).update(savePayload).eq("id", product.id)
          : await (supabase.from("products_verify") as any).insert(savePayload);

        if (saveError) throw saveError;
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save product.");
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
            <CountryCombobox countries={countries} defaultValue={product?.country_of_origin ?? ""} label="Country of origin" name="country_of_origin" required />
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
            <label className={labelClass}>
              Allergen Details
              <input name="allergen_information" defaultValue={product?.allergen_information ?? ""} className={inputClass} placeholder="None declared, milk, peanuts..." />
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
  suppliers
}: {
  countries: CountryOption[];
  facilities: FacilityOption[];
  products: ProductRow[];
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
              href={suppliers.length === 0 ? "/suppliers" : "/facilities"}
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
                  <td className="px-4 py-3 font-medium text-ink">{product.product_name}</td>
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
