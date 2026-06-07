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
  suppliers: { company_name: string } | null;
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
  suppliers
}: {
  countries: CountryOption[];
  product?: ProductRow | null;
  onClose: () => void;
  suppliers: SupplierOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

        const payload = {
          product_name: formData.get("product_name")?.toString().trim() ?? "",
          supplier_id: clean(formData.get("supplier_id")),
          country_of_origin: country,
          raw_or_processed: clean(formData.get("raw_or_processed")),
          intended_use: clean(formData.get("intended_use")),
          ingredient_list: clean(formData.get("ingredient_list")),
          allergen_information: clean(formData.get("allergen_information")),
          product_description: clean(formData.get("product_description"))
        };
        const supabase = createBrowserSupabaseClient();
        const { error: saveError } = product
          ? await (supabase.from("products_verify") as any).update(payload).eq("id", product.id)
          : await (supabase.from("products_verify") as any).insert(payload);

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
              Supplier
              <select name="supplier_id" className={inputClass} defaultValue={product?.supplier_id ?? ""}>
                <option value="">Unassigned</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.company_name}</option>
                ))}
              </select>
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
  products,
  suppliers
}: {
  countries: CountryOption[];
  products: ProductRow[];
  suppliers: SupplierOption[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);

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
          onClose={() => setShowForm(false)}
          product={editingProduct}
          suppliers={suppliers}
        />
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={openAddForm}
          className="inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
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
            Add products to link them to suppliers, map FSVP requirements, and track verification evidence.
          </p>
          <button
            type="button"
            onClick={openAddForm}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
          >
            Add your first product
          </button>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Product</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Origin</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Intended Use</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Allergens</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((product) => (
                <tr key={product.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-ink">{product.product_name}</td>
                  <td className="px-4 py-3 text-slate-600">{product.suppliers?.company_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{product.country_of_origin ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{labelize(product.intended_use)}</td>
                  <td className="px-4 py-3 text-slate-600">{product.allergen_information ?? "None declared"}</td>
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
