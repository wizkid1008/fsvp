import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleDot, Plus } from "lucide-react";
import { FSVP_SETUP_STEP_COPY } from "@/lib/setup/fsvp-steps";
import type { ProductStanding } from "@/lib/setup/fsvp-workflow";
import { isBlockedStanding, phaseFor } from "@/lib/dashboard/product-journey";

/**
 * Each product on its way through, with what it needs next.
 *
 * This listed RECORDS, which meant a product with no record yet appeared
 * nowhere — the five products needing classification were counted in the gate
 * list and named nowhere, while the two that happened to have records were the
 * only things on screen. Listing products shows the whole book, and a record
 * appears as a property of the product it belongs to.
 *
 * The gate name is the actionable line, not the phase. "Verifying" is a
 * location; "Complete QI attestations" is the thing to go and do, and a
 * dashboard row is read by someone deciding what to open next.
 */

function blockedReason(standing: ProductStanding): string {
  if (standing.recordStatus === "needs_corrective_action") return "Needs corrective action";
  if (standing.recordStatus === "rejected") return "Rejected — cannot be imported";
  return "Determination expired";
}

export function ProductProgressList({ standings }: { standings: ProductStanding[] }) {
  if (standings.length === 0) {
    return (
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <h2 className="mb-1 text-sm font-semibold text-ink">Products in progress</h2>
        <p className="text-sm text-slate-500">
          No products yet — add an exporter and a facility, then create the food you import.
        </p>
      </section>
    );
  }

  // Blocked first, then least far along: the top of the list is where the
  // work is.
  const ordered = [...standings].sort((a, b) => {
    const ba = isBlockedStanding(a);
    const bb = isBlockedStanding(b);
    if (ba !== bb) return ba ? -1 : 1;
    return phaseFor(a).index - phaseFor(b).index;
  });

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Products in progress</h2>
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-forest hover:text-forest"
        >
          <Plus className="h-3.5 w-3.5" />
          Add product
        </Link>
      </div>

      <ul className="divide-y divide-line">
        {ordered.map((standing) => {
          const blocked = isBlockedStanding(standing);
          const phase = phaseFor(standing);
          const done = standing.gateId === null;
          const needs = blocked
            ? blockedReason(standing)
            : done
            ? "Approved and in monitoring"
            : FSVP_SETUP_STEP_COPY[standing.gateId!].title;

          return (
            <li key={standing.id}>
              <Link
                href={standing.recordId ? `/fsvp-records/${standing.recordId}` : "/products"}
                className="group flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink group-hover:text-forest">
                    {standing.name}
                    {standing.supplierName && (
                      <span className="font-normal text-slate-400"> · {standing.supplierName}</span>
                    )}
                  </p>
                  <p
                    className={`truncate text-xs font-medium ${
                      blocked ? "text-red-600" : done ? "text-slate-500" : "text-amber-700"
                    }`}
                  >
                    {blocked && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                    {needs}
                  </p>
                </div>

                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                    blocked
                      ? "border-red-200 bg-red-50 text-red-700"
                      : done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  <CircleDot className="h-3.5 w-3.5" />
                  {blocked ? "Blocked" : phase.label}
                </span>

                <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-300 group-hover:text-forest sm:block" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
