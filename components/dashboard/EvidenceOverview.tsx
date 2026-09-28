import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EVIDENCE_ROWS, EvidenceProgressBar } from "@/components/evidence/EvidenceProgressCell";
import type { EvidenceProgress } from "@/lib/readiness/evidence-scope";

export type EvidenceOverviewRow = {
  label: string;
  /** How many exporters / facilities / products the totals cover. */
  entityCount: number;
  entityNoun: [singular: string, plural: string];
  href: string;
  progress: EvidenceProgress;
};

/**
 * Required evidence across the whole program, by level — the same four counts
 * the Evidence column shows on each list page, summed. Counts are of required
 * documents, not of exporters or products, so "11 awaiting review" means eleven
 * documents a reviewer can act on today.
 */
export function EvidenceOverview({ rows }: { rows: EvidenceOverviewRow[] }) {
  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">Required evidence</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Documents each exporter, facility and product owes under your published rules.
        </p>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.label}>
            <Link href={row.href} className="group block px-5 py-3 transition hover:bg-slate-50">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink group-hover:text-forest">
                  {row.label}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {row.entityCount} {row.entityCount === 1 ? row.entityNoun[0] : row.entityNoun[1]}
                    {row.progress.required > 0 && ` · ${row.progress.required} documents required`}
                  </span>
                </p>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-forest" />
              </div>
              {row.progress.required === 0 ? (
                <p className="mt-1.5 text-xs text-slate-400">
                  {row.entityCount === 0 ? `No ${row.entityNoun[1]} yet.` : "No documents required yet."}
                </p>
              ) : (
                <>
                  <div className="mt-2">
                    <EvidenceProgressBar progress={row.progress} />
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                    {EVIDENCE_ROWS.map((status) => {
                      const count = row.progress[status.key];
                      return (
                        <div key={status.key} className="flex items-center gap-1.5 text-xs">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${count === 0 ? "bg-slate-200" : status.dot}`} />
                          <dt className={count === 0 ? "text-slate-400" : "text-slate-600"}>{status.label}</dt>
                          <dd className={`ml-auto font-semibold tabular-nums sm:ml-1 ${count === 0 ? "text-slate-300" : "text-ink"}`}>
                            {count}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
