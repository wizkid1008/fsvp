"use client";

import { useState, useTransition } from "react";
import { CountryCombobox } from "@/components/profile/CountryCombobox";
import { FACILITY_TYPES } from "@/components/facilities/FacilityTable";

/**
 * Add a facility without leaving the product you're creating or fixing.
 *
 * The only two places a missing facility surfaced were both dead ends: the
 * product form disabled itself entirely if the account had zero facilities
 * anywhere, and the panel that fixes an orphaned product's missing link said
 * "add the facility first, then return to this product" — send the user away
 * to a different page, to a form with ten fields, then trust them to find
 * their way back. /api/facilities only actually requires three: a name, a
 * type, and a supplier to attach it to (country is not required by that route,
 * but the product this facility is for needs one for its country of origin,
 * so it is asked here). Everything else on the full facility record — FDA
 * registration, address lines, production capacity — can be filled in later
 * from the facility's own page; none of it blocks a product from existing.
 */

const FACILITY_TYPE_OPTIONS = FACILITY_TYPES.filter((t) => t.value);

export function InlineAddFacility({
  supplierId,
  countries,
  onCreated,
  onCancel,
}: {
  supplierId: string;
  countries: Array<{ country_code: string; country_name: string }>;
  onCreated: (facility: { id: string; facility_name: string; country: string }) => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    const facility_name = formData.get("facility_name")?.toString().trim() ?? "";
    const facility_type = formData.get("facility_type")?.toString() ?? "";
    const country = formData.get("country")?.toString().trim() ?? "";

    if (!facility_name) return setError("Name the facility.");
    if (!facility_type) return setError("Choose a facility type.");
    if (!country) return setError("Choose the facility's country.");

    startTransition(async () => {
      try {
        const res = await fetch("/api/facilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplier_ids: [supplierId],
            facility_name,
            facility_type,
            facility_address_json: { country },
          }),
        });
        const json = await res.json().catch(() => ({})) as { id?: string; error?: string };
        if (!res.ok || !json.id) throw new Error(json.error ?? "Could not add the facility.");
        onCreated({ id: json.id, facility_name, country });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add the facility.");
      }
    });
  }

  const inputClass = "mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
  const labelClass = "block text-xs font-medium text-slate-600";

  return (
    <form onSubmit={submit} className="mt-2 space-y-2.5 rounded-md border border-forest/30 bg-emerald-50/40 p-3">
      <p className="text-xs font-semibold text-ink">New facility</p>
      <label className={labelClass}>
        Facility name
        <input name="facility_name" required autoFocus className={inputClass} placeholder="Bogota Processing Facility" />
      </label>
      <label className={labelClass}>
        Facility type
        <select name="facility_type" required defaultValue="" className={inputClass}>
          <option value="" disabled>Select facility type</option>
          {FACILITY_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <CountryCombobox countries={countries} required />
      <p className="text-[11px] leading-4 text-slate-500">
        Everything else about this facility — registration, address, capacity — can be filled in
        later from the facility's own page.
      </p>
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-8 items-center rounded-md bg-forest px-3 text-xs font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add facility"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
