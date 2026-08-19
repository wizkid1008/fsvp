"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";

export type ProductFacilityOption = {
  id: string;
  facility_name: string;
  country: string | null;
};

export function ProductFacilityAssignmentPanel({
  productId,
  facilities,
}: {
  productId: string;
  facilities: ProductFacilityOption[];
}) {
  const router = useRouter();
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function assignFacility() {
    setError(null);
    if (!facilityId) {
      setError("Choose a facility first.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/products/assign-facility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: productId, facility_id: facilityId }),
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

          {facilities.length === 0 ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-amber-900">
              No facilities are available for this supplier yet. Add the facility first, then return
              to this product.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start">
              <label className="min-w-0 flex-1 text-sm font-medium text-amber-950">
                Facility
                <select
                  value={facilityId}
                  onChange={(event) => setFacilityId(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-md border border-amber-200 bg-white px-3 text-sm text-ink outline-none focus:border-forest"
                >
                  {facilities.map((facility) => (
                    <option key={facility.id} value={facility.id}>
                      {facility.facility_name}{facility.country ? ` (${facility.country})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={assignFacility}
                disabled={pending}
                className="mt-6 inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60"
              >
                {pending ? "Assigning..." : "Assign facility"}
              </button>
            </div>
          )}

          {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      </div>
    </section>
  );
}
