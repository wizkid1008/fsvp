import Link from "next/link";
import { ArrowRight, Check, CircleDot } from "lucide-react";
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
 * Called "Open pipeline work" rather than "Approval blockers": approval is one
 * of eleven gates here, not the whole list, and a draft record with no
 * evidence yet is work in progress rather than something blocking anyone. This
 * is also where a draft record now lives — Deadlines and reviews used to list
 * it as though it had a due date, which it does not.
 */

/**
 * "5 products", or a bare "2 outstanding" where the unit cannot be named.
 *
 * The QI stage counts one slot for the register plus one per record, so
 * calling its outstanding count a number of records would be wrong exactly
 * when the register is the thing missing.
 */
function describe(value: number, unit: string | null) {
  if (!unit) return `${value} outstanding`;
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

export function WhatNeedsDoing({
  gates,
}: {
  gates: WorkGate[];
}) {
  const next = firstOutstanding(gates);
  const remaining = outstandingCount(gates);
  const shown = gates.filter((gate) => gate.count > 0 && !gate.optional);
  const optional = gates.filter((gate) => gate.count > 0 && gate.optional);

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Open pipeline work</h2>
          <p className="mt-1 text-sm text-slate-500">
            {remaining === 0
              ? "Nothing is open. Every gate is clear."
              : `${remaining} of ${gates.length} gates have work open — each applies per item, so more than one can be open at once. Each row opens the pipeline with the affected items named.`}
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

      {shown.length === 0 ? (
        <div className="flex items-center gap-2 px-5 py-4 text-sm text-slate-500">
          <Check className="h-4 w-4 text-emerald-600" />
          Nothing is open right now.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((gate) => {
            const isNext = next?.id === gate.id;

            return (
              <li key={gate.id}>
                <Link
                  href={gate.detailHref}
                  className={`group flex flex-wrap items-center gap-3 px-5 py-3 transition hover:bg-slate-50 ${
                    isNext ? "bg-forest/5" : ""
                  }`}
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"
                  >
                    <CircleDot className="h-3 w-3" />
                  </span>

                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink group-hover:text-forest">
                    {gate.title}
                  </span>

                  <span className="text-xs text-slate-500">
                    {describe(gate.count, gate.unit)}
                  </span>

                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-forest" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {optional.length > 0 && (
        <div className="border-t border-line bg-slate-50 px-5 py-3 text-xs text-slate-600">
          {optional.map((gate) => (
            <Link key={gate.id} href={gate.detailHref} className="inline-flex items-center gap-1.5 font-medium text-forest hover:underline">
              {describe(gate.count, gate.unit)} ready for {gate.title.toLowerCase()}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
