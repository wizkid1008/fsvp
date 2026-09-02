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

function plural(count: number, unit: string) {
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
              : `${remaining} of ${gates.length} gates have work outstanding. They apply per item, so more than one can be open at once.`}
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
                href={gate.href}
                className={`group flex flex-wrap items-center gap-3 px-5 py-3 transition hover:bg-slate-50 ${
                  isNext ? "bg-forest/5" : ""
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    done
                      ? "bg-emerald-50 text-emerald-600"
                      : gate.optional
                      ? "bg-slate-100 text-slate-500"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {done ? <Check className="h-3 w-3" /> : gate.count}
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
                    ? gate.setup
                      ? "Done"
                      : "Clear"
                    : gate.setup
                    ? "Not started"
                    : gate.optional
                    ? `${plural(gate.count, gate.unit)} ready`
                    : plural(gate.count, gate.unit)}
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
