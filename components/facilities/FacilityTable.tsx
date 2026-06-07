"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Warehouse, X } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { CountryCombobox } from "@/components/profile/CountryCombobox";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Country, Json } from "@/types/database";

type CountryOption = Pick<Country, "country_code" | "country_name">;

type SupplierOption = {
  id: string;
  company_name: string;
};

export type FacilityRow = {
  id: string;
  facility_name: string;
  facility_type: string;
  fda_registration_number: string | null;
  food_safety_certifications: string[] | null;
  supplier_id: string | null;
  suppliers: { company_name: string } | null;
};

const FACILITY_TYPES = [
  { value: "", label: "Select facility type" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "storage", label: "Storage" },
  { value: "packaging", label: "Packaging" },
  { value: "processing", label: "Processing" },
  { value: "co_packer", label: "Co-packer" },
  { value: "other", label: "Other" }
];

function clean(value: FormDataEntryValue | null) {
  const text = value?.toString().trim() ?? "";
  return text || null;
}

function splitCertifications(value: string | null) {
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function AddFacilityForm({
  countries,
  onClose,
  suppliers
}: {
  countries: CountryOption[];
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
        const country = clean(formData.get("country"));

        if (!country || !countries.some((option) => option.country_name.toLowerCase() === country.toLowerCase())) {
          setError("Select a country from the dropdown list.");
          return;
        }

        const supplierId = clean(formData.get("supplier_id"));
        if (!supplierId || !suppliers.some((supplier) => supplier.id === supplierId)) {
          setError("Select a supplier from the supplier list.");
          return;
        }

        const addressJson: Json = {
          address_line_1: clean(formData.get("address_line_1")),
          city: clean(formData.get("city")),
          country
        };
        const supabase = createBrowserSupabaseClient();
        const { error: insertError } = await (supabase.from("facilities_verify") as any).insert({
          facility_name: formData.get("facility_name")?.toString().trim() ?? "",
          facility_type: formData.get("facility_type")?.toString().trim() ?? "",
          supplier_id: supplierId,
          facility_address_json: addressJson,
          fda_registration_number: clean(formData.get("fda_registration_number")),
          production_capacity: clean(formData.get("production_capacity")),
          manufacturing_processes: clean(formData.get("manufacturing_processes")),
          food_safety_certifications: splitCertifications(clean(formData.get("food_safety_certifications")))
        });

        if (insertError) throw insertError;
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save facility.");
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
          <h2 className="text-lg font-semibold text-ink">Add Facility</h2>
          <button type="button" onClick={onClose} className="rounded p-1 transition hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Facility Name <span className="text-red-500">*</span>
              <input name="facility_name" required className={inputClass} placeholder="Santiago Plant 2" />
            </label>
            <label className={labelClass}>
              Supplier <span className="text-red-500">*</span>
              <select name="supplier_id" required className={inputClass} defaultValue="">
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.company_name}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Facility Type <span className="text-red-500">*</span>
              <select name="facility_type" required className={inputClass} defaultValue="">
                {FACILITY_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              FDA Registration #
              <input name="fda_registration_number" className={inputClass} placeholder="Optional" />
            </label>
            <label className={labelClass}>
              Address
              <input name="address_line_1" className={inputClass} placeholder="Street address" />
            </label>
            <label className={labelClass}>
              City
              <input name="city" className={inputClass} placeholder="City" />
            </label>
            <CountryCombobox countries={countries} required />
            <label className={labelClass}>
              Production Capacity
              <input name="production_capacity" className={inputClass} placeholder="Optional" />
            </label>
          </div>

          <label className={labelClass}>
            Manufacturing Processes
            <textarea name="manufacturing_processes" className={textareaClass} placeholder="Process summary or notes" />
          </label>
          <label className={labelClass}>
            Food Safety Certifications
            <input name="food_safety_certifications" className={inputClass} placeholder="BRCGS, SQF, GMP" />
            <span className="mt-1 block text-xs text-slate-500">Separate multiple certifications with commas.</span>
          </label>

          {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              Cancel
            </button>
            <button disabled={pending} className="h-10 rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60">
              {pending ? "Saving..." : "Add facility"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function FacilityTable({
  countries,
  facilities,
  suppliers
}: {
  countries: CountryOption[];
  facilities: FacilityRow[];
  suppliers: SupplierOption[];
}) {
  const [showForm, setShowForm] = useState(false);
  const canAddFacility = suppliers.length > 0;
  const addButtonClass = "inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500";

  return (
    <>
      {showForm ? <AddFacilityForm countries={countries} onClose={() => setShowForm(false)} suppliers={suppliers} /> : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={!canAddFacility}
          onClick={() => setShowForm(true)}
          className={addButtonClass}
        >
          Add facility
        </button>
      </div>

      {facilities.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-slate-50 px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-white shadow-soft">
            <Warehouse className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">No facilities recorded</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
            {canAddFacility
              ? "Add manufacturing and storage facilities to link them to suppliers and map their food safety certifications."
              : "Add a supplier first, then create manufacturing or storage facilities from that supplier list."}
          </p>
          {canAddFacility ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className={`mt-6 ${addButtonClass}`}
            >
              Add your first facility
            </button>
          ) : (
            <a
              href="/suppliers"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
            >
              Add a supplier first
            </a>
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Facility</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">FDA Registration</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Certifications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {facilities.map((facility) => (
                <tr key={facility.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-ink">{facility.facility_name}</td>
                  <td className="px-4 py-3 text-slate-600">{facility.suppliers?.company_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{labelize(facility.facility_type)}</td>
                  <td className="px-4 py-3 text-slate-600">{facility.fda_registration_number ?? "-"}</td>
                  <td className="px-4 py-3">
                    {facility.food_safety_certifications && facility.food_safety_certifications.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {facility.food_safety_certifications.map((cert) => (
                          <StatusBadge key={cert} tone="success">{cert}</StatusBadge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400">None on file</span>
                    )}
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
