import { AlertTriangle } from "lucide-react";
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

const PHASE_FILL = [
  "bg-slate-400",   // registering
  "bg-violet-400",  // opening record
  "bg-amber-400",   // verifying
  "bg-sky-400",     // awaiting approval
  "bg-emerald-500", // approved
];

export function ProgramStatus({ summary }: { summary: ProductSummary }) {
  const { total, blocked, byPhase, approved } = summary;

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Programme status</h2>
          <p className="mt-1 text-sm text-slate-500">
            {total === 0
              ? "No products yet. Every FSVP obligation is measured against the food you import."
              : `${approved} of ${total} product${total === 1 ? "" : "s"} approved and importable.`}
          </p>
        </div>
        {blocked > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {blocked} blocked
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {PRODUCT_PHASES.map((phase, i) => {
            const count = byPhase[i];
            return (
              <div key={phase.key}>
                {/* An empty phase keeps its slot and shows a hollow rail, so
                    the shape of the journey is visible from the first product
                    rather than appearing one phase at a time. */}
                <div
                  className={`h-1.5 w-full rounded-full ${count > 0 ? PHASE_FILL[i] : "bg-slate-100"}`}
                />
                <p
                  className={`mt-2 text-lg font-semibold ${count > 0 ? "text-ink" : "text-slate-300"}`}
                >
                  {count}
                </p>
                <p className="text-xs leading-4 text-slate-500">{phase.label}</p>
              </div>
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
