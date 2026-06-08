"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit2, MapPin, Warehouse, X } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { CountryCombobox } from "@/components/profile/CountryCombobox";
import { FacilityMapPicker } from "@/components/facilities/FacilityMapPicker";
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
  facility_address_json: Json;
  fda_registration_number: string | null;
  production_capacity: string | null;
  manufacturing_processes: string | null;
  food_safety_certifications: string[] | null;
  supplier_id: string | null;
  supplier_ids?: string[];
  supplier_names?: string[];
  suppliers: { company_name: string } | null;
  evidence_count?: number;
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

function selectedValues(select: HTMLSelectElement) {
  return Array.from(select.selectedOptions).map((option) => option.value).filter(Boolean);
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function readJsonString(value: Json | undefined) {
  return typeof value === "string" ? value : "";
}

function readJsonNumber(value: Json | undefined) {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return null;

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function readFacilityAddress(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      addressLine1: "",
      city: "",
      country: "",
      latitude: null,
      longitude: null
    };
  }

  return {
    addressLine1: readJsonString(value.address_line_1),
    city: readJsonString(value.city),
    country: readJsonString(value.country),
    latitude: readJsonNumber(value.latitude),
    longitude: readJsonNumber(value.longitude)
  };
}

function mapUrl(latitude: number, longitude: number) {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=12/${latitude}/${longitude}`;
}

function readCoordinate(value: FormDataEntryValue | null, min: number, max: number) {
  const text = value?.toString().trim() ?? "";
  if (!text) return null;

  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    return Number.NaN;
  }

  return numeric;
}

function AddFacilityForm({
  countries,
  facility,
  onClose,
  suppliers
}: {
  countries: CountryOption[];
  facility?: FacilityRow | null;
  onClose: () => void;
  suppliers: SupplierOption[];
}) {
  const router = useRouter();
  const address = readFacilityAddress(facility?.facility_address_json ?? null);
  const [error, setError] = useState<string | null>(null);
  const [coordinates, setCoordinates] = useState({
    latitude: address.latitude?.toString() ?? "",
    longitude: address.longitude?.toString() ?? ""
  });
  const [supplierIds, setSupplierIds] = useState<string[]>(
    facility?.supplier_ids && facility.supplier_ids.length > 0
      ? facility.supplier_ids
      : facility?.supplier_id
        ? [facility.supplier_id]
        : suppliers.length === 1
          ? [suppliers[0]?.id ?? ""].filter(Boolean)
          : []
  );
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

        const selectedSupplierIds = supplierIds;
        if (selectedSupplierIds.length === 0 || selectedSupplierIds.some((id) => !suppliers.some((supplier) => supplier.id === id))) {
          setError("Select at least one supplier that can access this facility.");
          return;
        }

        const latitude = readCoordinate(formData.get("latitude"), -90, 90);
        const longitude = readCoordinate(formData.get("longitude"), -180, 180);
        if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
          setError("Enter valid GPS coordinates: latitude between -90 and 90, longitude between -180 and 180.");
          return;
        }
        if ((latitude === null && longitude !== null) || (latitude !== null && longitude === null)) {
          setError("Enter both latitude and longitude, or leave both blank.");
          return;
        }

        const addressJson: Json = {
          address_line_1: clean(formData.get("address_line_1")),
          city: clean(formData.get("city")),
          country,
          latitude,
          longitude
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
        const payload = {
          facility_name: formData.get("facility_name")?.toString().trim() ?? "",
          facility_type: formData.get("facility_type")?.toString().trim() ?? "",
          supplier_id: selectedSupplierIds[0] ?? null,
          ...(profile?.importer_id ? { importer_id: profile.importer_id } : {}),
          facility_address_json: addressJson,
          fda_registration_number: clean(formData.get("fda_registration_number")),
          production_capacity: clean(formData.get("production_capacity")),
          manufacturing_processes: clean(formData.get("manufacturing_processes")),
          food_safety_certifications: splitCertifications(clean(formData.get("food_safety_certifications")))
        };
        const saveResult = facility
          ? await (supabase.from("facilities_verify") as any).update(payload).eq("id", facility.id).select("id, importer_id").single()
          : await (supabase.from("facilities_verify") as any).insert(payload).select("id, importer_id").single();

        if (saveResult.error) throw saveResult.error;

        const facilityId = saveResult.data.id;
        const importerId = saveResult.data.importer_id ?? null;
        await (supabase.from("facility_supplier_access") as any)
          .delete()
          .eq("facility_id", facilityId);

        const accessRows = selectedSupplierIds.map((supplierId) => ({
          facility_id: facilityId,
          supplier_id: supplierId,
          importer_id: importerId,
          access_level: "manage"
        }));

        if (accessRows.length > 0) {
          const { error: accessError } = await (supabase.from("facility_supplier_access") as any).upsert(accessRows, {
            onConflict: "facility_id,supplier_id"
          });

          if (accessError) throw accessError;
        }

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
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold text-ink">{facility ? "Edit Facility" : "Add Facility"}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 transition hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Facility Name <span className="text-red-500">*</span>
              <input name="facility_name" required defaultValue={facility?.facility_name ?? ""} className={inputClass} placeholder="Santiago Plant 2" />
            </label>
            <label className={labelClass}>
              Supplier access <span className="text-red-500">*</span>
              <select
                name="supplier_ids"
                required
                multiple
                className="mt-1.5 min-h-24 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest"
                value={supplierIds}
                onChange={(event) => setSupplierIds(selectedValues(event.currentTarget))}
              >
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.company_name}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">Hold Ctrl or Shift to assign the facility to more than one supplier.</span>
            </label>
            <label className={labelClass}>
              Facility Type <span className="text-red-500">*</span>
              <select name="facility_type" required className={inputClass} defaultValue={facility?.facility_type ?? ""}>
                {FACILITY_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              FDA Registration #
              <input name="fda_registration_number" defaultValue={facility?.fda_registration_number ?? ""} className={inputClass} placeholder="Optional" />
            </label>
            <label className={labelClass}>
              Address
              <input name="address_line_1" defaultValue={address.addressLine1} className={inputClass} placeholder="Street address" />
            </label>
            <label className={labelClass}>
              City
              <input name="city" defaultValue={address.city} className={inputClass} placeholder="City" />
            </label>
            <CountryCombobox countries={countries} defaultValue={address.country} required />
            <label className={labelClass}>
              Production Capacity
              <input name="production_capacity" defaultValue={facility?.production_capacity ?? ""} className={inputClass} placeholder="Optional" />
            </label>
            <label className={labelClass}>
              Latitude
              <input
                name="latitude"
                inputMode="decimal"
                value={coordinates.latitude}
                onChange={(event) => setCoordinates((current) => ({ ...current, latitude: event.target.value }))}
                className={inputClass}
                placeholder="e.g. 15.500654"
              />
            </label>
            <label className={labelClass}>
              Longitude
              <input
                name="longitude"
                inputMode="decimal"
                value={coordinates.longitude}
                onChange={(event) => setCoordinates((current) => ({ ...current, longitude: event.target.value }))}
                className={inputClass}
                placeholder="e.g. 32.559899"
              />
            </label>
          </div>

          <div className="rounded-md border border-line bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">Map location</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Open the map to search for a place, click the facility location, or drag the marker. Coordinates are saved into the facility record.
                </p>
              </div>
              <FacilityMapPicker coordinates={coordinates} onChange={setCoordinates} />
            </div>
          </div>

          <label className={labelClass}>
            Manufacturing Processes
            <textarea name="manufacturing_processes" defaultValue={facility?.manufacturing_processes ?? ""} className={textareaClass} placeholder="Process summary or notes" />
          </label>
          <label className={labelClass}>
            Food Safety Certifications
            <input name="food_safety_certifications" defaultValue={facility?.food_safety_certifications?.join(", ") ?? ""} className={inputClass} placeholder="BRCGS, SQF, GMP" />
            <span className="mt-1 block text-xs text-slate-500">Separate multiple certifications with commas.</span>
          </label>

          {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              Cancel
            </button>
            <button disabled={pending} className="h-10 rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60">
              {pending ? "Saving..." : facility ? "Save facility" : "Add facility"}
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
  const [editingFacility, setEditingFacility] = useState<FacilityRow | null>(null);
  const canAddFacility = suppliers.length > 0;
  const addButtonClass = "inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500";

  function openAddForm() {
    setEditingFacility(null);
    setShowForm(true);
  }

  function openEditForm(facility: FacilityRow) {
    setEditingFacility(facility);
    setShowForm(true);
  }

  return (
    <>
      {showForm ? (
        <AddFacilityForm
          countries={countries}
          facility={editingFacility}
          onClose={() => setShowForm(false)}
          suppliers={suppliers}
        />
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={!canAddFacility}
          onClick={openAddForm}
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
              onClick={openAddForm}
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
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Location</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Certifications</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Evidence</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {facilities.map((facility) => {
                const address = readFacilityAddress(facility.facility_address_json);
                const coordinates = address.latitude !== null && address.longitude !== null
                  ? { latitude: address.latitude, longitude: address.longitude }
                  : null;

                return (
                  <tr key={facility.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-ink">{facility.facility_name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {facility.supplier_names && facility.supplier_names.length > 0
                        ? facility.supplier_names.join(", ")
                        : facility.suppliers?.company_name ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{labelize(facility.facility_type)}</td>
                    <td className="px-4 py-3 text-slate-600">{facility.fda_registration_number ?? "-"}</td>
                    <td className="px-4 py-3">
                      {coordinates ? (
                        <a
                          href={mapUrl(coordinates.latitude, coordinates.longitude)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm font-semibold text-forest hover:underline"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          View map
                        </a>
                      ) : (
                        <span className="text-slate-400">No GPS</span>
                      )}
                    </td>
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
                    <td className="px-4 py-3">
                      <a
                        href={`/evidence?entity=facility&id=${facility.id}`}
                        className="font-semibold text-forest hover:underline"
                      >
                        {facility.evidence_count ?? 0} documents
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEditForm(facility)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-semibold text-slate-600 transition hover:border-forest hover:text-forest"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
