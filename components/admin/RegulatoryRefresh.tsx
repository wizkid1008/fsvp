"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

export type RunSummary = {
  source: string;
  label: string;
  status: "running" | "succeeded" | "failed" | null;
  completedAt: string | null;
  recordsSeen: number | null;
  recordsNew: number | null;
  candidatesCreated: number | null;
  errorMessage: string | null;
};

/**
 * Refreshes the FDA data for the whole platform.
 *
 * Platform-level rather than per-tenant: regulatory_events holds public facts
 * about firms, so one refresh serves every importer. What each tenant makes of
 * the result is their own decision, taken on /compliance-history.
 */
export function RegulatoryRefresh({ runs }: { runs: RunSummary[] }) {
  const router = useRouter();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    setResult(null);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/regulatory/ingest", { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "The refresh failed.");
          router.refresh();
          return;
        }
        // Partial success is normal while only some sources are configured, so
        // the summary reports both halves rather than a single verdict.
        const sources: Array<{ source: string; error: string | null }> = json.sources ?? [];
        const failed = sources.filter((s) => s.error);

        setResult(
          `${sources.length - failed.length} of ${sources.length} sources refreshed. ` +
          `${json.records_seen} records read, ${json.records_new} new, ` +
          `${json.candidates_created} candidate match${json.candidates_created === 1 ? "" : "es"} raised.`
        );
        if (failed.length > 0) setError(json.error ?? "Some sources failed.");
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <aside className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">FDA Compliance Data</h2>
          <p className="mt-1 text-sm text-slate-500">
            Public FDA records screened against every tenant&apos;s suppliers.
          </p>
        </div>
        <ShieldAlert className="h-5 w-5 text-[#2DA8FF]" />
      </div>

      <div className="mt-5 space-y-3">
        {runs.map((r) => (
          <div key={r.source} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-slate-700">{r.label}</span>
            {r.status === null ? (
              <StatusBadge tone="neutral">Never refreshed</StatusBadge>
            ) : r.status === "failed" ? (
              <StatusBadge tone="danger">Failed</StatusBadge>
            ) : r.status === "running" ? (
              <StatusBadge tone="info">Running</StatusBadge>
            ) : (
              <span className="text-xs text-slate-600">
                {r.completedAt ? new Date(r.completedAt).toLocaleString() : "—"}
                {r.recordsNew !== null ? ` · ${r.recordsNew} new` : ""}
              </span>
            )}
          </div>
        ))}
        {runs.some((r) => r.status === "failed" && r.errorMessage) && (
          <p className="rounded-md bg-red-50 p-2.5 text-xs leading-relaxed text-red-700">
            {runs.find((r) => r.status === "failed")?.errorMessage}
          </p>
        )}
      </div>

      <button
        onClick={refresh}
        disabled={pending}
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 shadow-soft transition hover:bg-slate-50 disabled:opacity-60"
      >
        <RefreshCw className={"h-4 w-4" + (pending ? " animate-spin" : "")} />
        {pending ? "Refreshing…" : "Refresh FDA data"}
      </button>

      {result && <p className="mt-3 text-sm text-emerald-700">{result}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <p className="mt-3 text-xs leading-relaxed text-slate-500">
        Recalls come from openFDA and need no credentials. Import refusals, inspection outcomes and
        warning letters need <code>FDA_DATADASHBOARD_USER</code> and <code>FDA_DATADASHBOARD_KEY</code>;
        without both they are skipped rather than attempted, so they stay marked never refreshed.
        Import alerts have no API at all and must be checked by hand.
      </p>
    </aside>
  );
}
