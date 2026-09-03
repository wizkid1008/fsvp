"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { InlineAddFacility } from "@/components/products/InlineAddFacility";

export type ProductFacilityOption = {
  id: string;
  facility_name: string;
  country: string | null;
};

export function ProductFacilityAssignmentPanel({
  productId,
  facilities,
  supplierId,
  countries,
}: {
  productId: string;
  facilities: ProductFacilityOption[];
  /** Needed to add a facility inline — a facility must belong to a supplier. */
  supplierId: string | null;
  countries: Array<{ country_code: string; country_name: string }>;
}) {
  const router = useRouter();
  // This used to dead-end here: "No facilities are available for this
  // supplier yet. Add the facility first, then return to this product." — go
  // to a different page, fill in a ten-field form, then find your way back.
  // /api/facilities only actually requires a name and a type (country is
  // needed too, but only because THIS product needs one for its origin), so
  // there was no real reason the fix couldn't happen on this page.
  const [options, setOptions] = useState(facilities);
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? "");
  const [addingFacility, setAddingFacility] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function assignFacility(id: string) {
    setError(null);
    if (!id) {
      setError("Choose a facility first.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/products/assign-facility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: productId, facility_id: id }),
        });
        const json = await res.json().catch(() => ({})) as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Could not assign facility.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not assign facility.");
      }
    });
  }

  return (
    <section id="assign-facility" className="rounded-lg border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-amber-950">Assign Product Facility</h2>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            This product is not linked to a facility yet. Assign the facility that makes, packs,
            or holds this product before creating its FSVP hazard analysis.
          </p>

          {addingFacility && supplierId ? (
            <InlineAddFacility
              supplierId={supplierId}
              countries={countries}
              onCancel={() => setAddingFacility(false)}
              onCreated={(facility) => {
                setOptions((prev) => [...prev, { id: facility.id, facility_name: facility.facility_name, country: facility.country }]);
                setFacilityId(facility.id);
                setAddingFacility(false);
                assignFacility(facility.id);
              }}
            />
          ) : options.length === 0 ? (
            supplierId ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setAddingFacility(true)}
                  className="inline-flex h-9 items-center rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d]"
                >
                  Add a facility
                </button>
              </div>
            ) : (
              <p className="mt-3 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-amber-900">
                This product has no exporter set, so a facility cannot be attached to it yet. Set
                the exporter first, from the product's edit form.
              </p>
            )
          ) : (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
              <label className="min-w-0 flex-1 text-sm font-medium text-amber-950">
                Facility
                <select
                  value={facilityId}
                  onChange={(event) => setFacilityId(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-md border border-amber-200 bg-white px-3 text-sm text-ink outline-none focus:border-forest"
                >
                  {options.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.facility_name}{facility.country ? ` (${facility.country})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-6 flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => assignFacility(facilityId)}
                  disabled={pending}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60"
                >
                  {pending ? "Assigning..." : "Assign facility"}
                </button>
                {supplierId && (
                  <button
                    type="button"
                    onClick={() => setAddingFacility(true)}
                    className="inline-flex h-10 shrink-0 items-center rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Add a different facility
                  </button>
                )}
              </div>
            </div>
          )}

          {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      </div>
    </section>
  );
}
