import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { firstOutstanding, outstandingCount, type WorkGate } from "@/lib/dashboard/outstanding-work";

/**
 * Every gate, with how many items still need it.
 *
 * Replaces three sections that were all the same data at different
 * aggregations: six metric tiles, three "what's gating approvals" buckets, and
 * a "next step · 4 of 11" card. Between them your two records could be counted
 * four times and your five products three, with no stated relationship between
 * the numbers — so a reader could not tell whether they had seven problems or
 * twenty-six.
 *
 * The named-item lists those tiles summarised are still on the page, in Needs
 * your attention. Nothing was lost by deleting the counts of them.
 */

/**
 * "5 products", or a bare "2 outstanding" where the unit cannot be named.
 *
 * The QI stage counts one slot for the register plus one per record, so
 * calling its outstanding count a number of records would be wrong exactly
 * when the register is the thing missing.
 */
function describe(count: number, unit: string | null) {
  if (!unit) return `${count} outstanding`;
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function WhatNeedsDoing({ gates }: { gates: WorkGate[] }) {
  const next = firstOutstanding(gates);
  const remaining = outstandingCount(gates);

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">What needs doing</h2>
          <p className="mt-1 text-sm text-slate-500">
            {remaining === 0
              ? "Every gate is clear. Nothing is blocking an approval."
              : `${remaining} of ${gates.length} gates have work outstanding — they apply per item, so more than one is open at once. Each row opens the pipeline, where its blockers are named.`}
          </p>
        </div>
        {next && (
          <Link
            href={next.href}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d]"
          >
            {next.actionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>

      <ul className="divide-y divide-line">
        {gates.map((gate) => {
          const done = gate.count === 0;
          const isNext = next?.id === gate.id;

          return (
            <li key={gate.id}>
              <Link
                href={gate.detailHref}
                className={`group flex flex-wrap items-center gap-3 px-5 py-3 transition hover:bg-slate-50 ${
                  isNext ? "bg-forest/5" : ""
                }`}
              >
                {/* A dot, not the count. This badge held the number, which the
                    row then printed again on the right — and on the left of an
                    ordered list a bare integer reads as POSITION, so "Classify
                    product" showed a 1 while the pipeline calls the same gate
                    Stage 4, and "Open FSVP record" looked like step 5 when it
                    meant five products. */}
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    done
                      ? "bg-emerald-50 text-emerald-600"
                      : gate.optional
                      ? "bg-slate-100"
                      : "bg-amber-100"
                  }`}
                >
                  {done ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        gate.optional ? "bg-slate-400" : "bg-amber-600"
                      }`}
                    />
                  )}
                </span>

                <span
                  className={`min-w-0 flex-1 truncate text-sm ${
                    done ? "text-slate-400" : "font-medium text-ink group-hover:text-forest"
                  }`}
                >
                  {gate.title}
                </span>

                <span className="text-xs text-slate-500">
                  {done
                    ? "Clear"
                    : gate.optional
                    ? `${describe(gate.count, gate.unit)} ready`
                    : describe(gate.count, gate.unit)}
                </span>

                <ArrowRight
                  className={`h-3.5 w-3.5 shrink-0 ${
                    done ? "text-slate-200" : "text-slate-300 group-hover:text-forest"
                  }`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
