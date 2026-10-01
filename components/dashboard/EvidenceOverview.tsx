"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EvidenceBreakdown } from "@/components/evidence/EvidenceProgressCell";
import type { EvidenceOverviewRow } from "@/lib/dashboard/evidence-overview";

/**
 * Required evidence across the whole program, by level — the same four counts
 * the Evidence column shows on each list page, summed. Counts are of required
 * documents, not of exporters or products, so "11 awaiting review" means eleven
 * documents a reviewer can act on today.
 *
 * Fetched from /api/dashboard/evidence after the page renders, not computed by
 * the page: see lib/dashboard/evidence-overview.ts. A failed load says so —
 * it never falls back to "No documents required".
 */
export function EvidenceOverview() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error" } | { kind: "ready"; rows: EvidenceOverviewRow[] }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/evidence", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        setState(res.ok && json?.rows ? { kind: "ready", rows: json.rows } : { kind: "error" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <EvidenceOverviewCard
      description="Documents each exporter, facility and product owes under your published rules."
      rows={state.kind === "ready" ? state.rows : null}
      fallback={
        state.kind === "loading" ? (
          <p className="px-5 py-4 text-xs text-slate-400">Counting required documents…</p>
        ) : state.kind === "error" ? (
          <p className="px-5 py-4 text-xs text-red-700">
            Could not load the evidence counts. Refresh to try again, or open{" "}
            <Link href="/exporters" className="font-semibold underline">Exporters</Link> for each one&rsquo;s documents.
          </p>
        ) : null
      }
    />
  );
}

/**
 * The card itself, shared with the exporter's and supplier's dashboard
 * (ExporterDashboard), which computes its rows on the server — it has no
 * setup plan eating its request budget. Same bars, same counts, same links,
 * one row per level.
 */
export function EvidenceOverviewCard({
  description,
  rows,
  fallback = null,
}: {
  description: string;
  rows: EvidenceOverviewRow[] | null;
  /** Shown instead of the rows while they load or if they failed. */
  fallback?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">Required evidence</h2>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      {rows === null ? fallback : (
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
                  <div className="mt-2">
                    <EvidenceBreakdown progress={row.progress} />
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
