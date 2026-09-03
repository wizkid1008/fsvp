import { AlertTriangle, Building2, PackageCheck, ShipWheel } from "lucide-react";
import { PRODUCT_PHASES, type ProductSummary } from "@/lib/dashboard/product-journey";

/**
 * Where the whole programme stands, counted in products.
 *
 * It counted RECORDS — "0 of 2 records approved" — while the gate list beside
 * it counted products, "5 products need classification". Two denominators on
 * one screen with the join never stated, so the two sections read as
 * contradicting each other when they were only counting different things. The
 * product is the unit an importer thinks in, and a record is an artefact of a
 * product rather than a peer of it: a product may have no record yet, or
 * several where it is sourced from more than one facility.
 *
 * SHOWN AS A TRACK, NOT A PROPORTIONAL BAR
 *
 * An earlier version was one stacked bar sized by how many sat in each phase.
 * On a real account it rendered as a single flat grey band, because everything
 * was in the first phase and the first phase was grey — indistinguishable from
 * an empty progress bar or a loading skeleton. All phases are drawn now, so
 * two products at the start read as two products at the start of a five-phase
 * journey rather than as a bar that failed to load.
 */

function describe(value: number, total: number, unit: string, plural = `${unit}s`) {
  return `${value} of ${total} ${total === 1 ? unit : plural}`;
}

export function ProgramStatus({
  summary,
  supplyChain,
}: {
  summary: ProductSummary;
  supplyChain: {
    exporters: number;
    approvedExporters: number;
    facilities: number;
    approvedFacilities: number;
  };
}) {
  const { total, blocked, byPhase, approved } = summary;
  const metrics = [
    {
      label: "Approved products",
      value: describe(approved, total, "product"),
      icon: PackageCheck,
    },
    {
      label: "Approved facilities",
      value: describe(supplyChain.approvedFacilities, supplyChain.facilities, "facility", "facilities"),
      icon: Building2,
    },
    {
      label: "Approved exporters",
      value: describe(supplyChain.approvedExporters, supplyChain.exporters, "exporter"),
      icon: ShipWheel,
    },
  ];

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Product status</h2>
          <p className="mt-1 text-sm text-slate-500">
            {total === 0
              ? "No products yet. Every FSVP obligation is measured against the food you import."
              : "Approved supply-chain counts and where active products currently sit."}
          </p>
        </div>
        {blocked > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {blocked} blocked
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-md border border-line bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Icon className="h-3.5 w-3.5 text-forest" />
                {metric.label}
              </div>
              <p className="mt-2 text-xl font-semibold text-ink">{metric.value}</p>
            </div>
          );
        })}
      </div>

      {total > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {PRODUCT_PHASES.map((phase, i) => {
            const count = byPhase[i];
            return (
              <span
                key={phase.key}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                  count > 0
                    ? "border-slate-300 bg-white text-ink"
                    : "border-slate-100 bg-slate-50 text-slate-400"
                }`}
              >
                <span className="font-semibold">{count}</span>
                {phase.label}
              </span>
            );
          })}
        </div>
      )}

      {blocked > 0 && (
        <p className="mt-3 border-t border-line pt-3 text-xs text-slate-500">
          {blocked} product{blocked === 1 ? " is" : "s are"} blocked and not on the track above —
          a blocked record has stopped wherever it had reached.
        </p>
      )}
    </section>
  );
}
