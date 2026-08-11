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
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // One source per request, and one bounded window within it. Refreshing all
  // four across two years in a single request exceeded the Cloudflare Worker
  // budget outright (Error 1102) and wrote nothing.
  function refresh(source: string) {
    setResult(null);
    setError(null);
    setBusy(source);

    startTransition(async () => {
      try {
        const res = await fetch("/api/regulatory/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source }),
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(json.error ?? "The refresh failed.");
        } else {
          setResult(
            `${json.records_seen} records read for ${json.window_from} to ${json.window_to}, ` +
            `${json.records_new} new, ${json.candidates_created} candidate ` +
            `match${json.candidates_created === 1 ? "" : "es"} raised.` +
            (json.caught_up
              ? ""
              : " This source is still catching up — run it again to continue from where it stopped.")
          );
        }
        setBusy(null);
        router.refresh();
      } catch {
        setError("Could not reach the server.");
        setBusy(null);
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
          <div key={r.source} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <span className="font-medium text-slate-700">{r.label}</span>
              <span className="ml-2 text-xs text-slate-500">
                {r.status === null ? "Never refreshed"
                  : r.status === "failed" ? "Last run failed"
                  : r.status === "running" ? "Running"
                  : r.completedAt
                    ? `${new Date(r.completedAt).toLocaleDateString()}${r.recordsNew !== null ? ` · ${r.recordsNew} new` : ""}`
                    : "—"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {r.status === "failed" && <StatusBadge tone="danger">Failed</StatusBadge>}
              {r.status === null && <StatusBadge tone="neutral">Never run</StatusBadge>}
              <button
                onClick={() => refresh(r.source)}
                disabled={pending}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={"h-3.5 w-3.5" + (busy === r.source ? " animate-spin" : "")} />
                {busy === r.source ? "Running…" : "Refresh"}
              </button>
            </div>
          </div>
        ))}
        {runs.some((r) => r.status === "failed" && r.errorMessage) && (
          <p className="rounded-md bg-red-50 p-2.5 text-xs leading-relaxed text-red-700">
            {runs.find((r) => r.status === "failed")?.errorMessage}
          </p>
        )}
      </div>

      {result && <p className="mt-3 text-sm text-emerald-700">{result}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        One source at a time, and each run covers at most four months. A Cloudflare Worker has a
        fixed budget per request, so a two-year backfill is walked forward across several runs
        rather than attempted in one — press Refresh again while a source says it is still catching
        up.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Recalls come from openFDA and need no credentials. Import refusals, inspection outcomes and
        warning letters need <code>FDA_DATADASHBOARD_USER</code> and <code>FDA_DATADASHBOARD_KEY</code>;
        without both they are skipped rather than attempted, so they stay marked never refreshed.
        Import alerts have no API at all and must be checked by hand.
      </p>
    </aside>
  );
}
