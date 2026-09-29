"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

/**
 * Where each product stands in the FSVP pipeline, for the importer's Products
 * page — fetched from /api/products/standings, which computes it exactly as the
 * dashboard's Product Status card does. So "Approved" here and there is the same
 * count: a product through every gate with an approved FSVP record.
 *
 * Fetched after render rather than by the page, for the same reason as the
 * dashboard's evidence card: the setup plan would spend the page's Worker
 * subrequest budget. Until it arrives the badges and counts say so, and a
 * failed load says it failed — nothing falls back to a guess.
 */

export type ProductStandingsResponse = {
  /** Per product: where it stands in the FSVP pipeline — the dashboard's phases. */
  standings: Record<string, { phase: string; label: string; blocked: boolean }>;
  approved: number;
  blocked: number;
};

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: ProductStandingsResponse };

const StandingsContext = createContext<State | null>(null);

export function ProductStandingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/products/standings", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        setState(res.ok && json?.standings ? { kind: "ready", data: json } : { kind: "error" });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <StandingsContext.Provider value={state}>{children}</StandingsContext.Provider>;
}

/** Null outside a provider — the table then shows the evidence score instead. */
export function useProductStandings(): State | null {
  return useContext(StandingsContext);
}

function toneFor(phase: string): StatusTone {
  if (phase === "approved") return "success";
  if (phase === "blocked") return "danger";
  if (phase === "approval") return "info";
  return "warning";
}

export function ProductFsvpStatus({ productId }: { productId: string }) {
  const state = useProductStandings();
  if (!state || state.kind === "loading") return <span className="text-xs text-slate-400">…</span>;
  if (state.kind === "error") return <span className="text-xs text-slate-400" title="Could not load">—</span>;
  const standing = state.data.standings[productId];
  // The pipeline covers foods currently imported; a discontinued or
  // never-imported product has no standing, and the Imported column says why.
  if (!standing) return <span className="text-xs text-slate-400" title="Not in the FSVP pipeline">—</span>;
  return <StatusBadge tone={toneFor(standing.phase)}>{standing.label}</StatusBadge>;
}

/** The Products page's cards, counted as the dashboard counts them. */
export function ProductStatusCards({ added }: { added: number }) {
  const state = useProductStandings();
  const value = (pick: (d: ProductStandingsResponse) => number) =>
    state?.kind === "ready" ? pick(state.data) : null;

  const cards: Array<{ label: string; value: number | null; tone: StatusTone }> = [
    { label: "Products Added", value: added, tone: "info" },
    { label: "Products Approved", value: value((d) => d.approved), tone: "success" },
    { label: "Products Blocked", value: value((d) => d.blocked), tone: "danger" },
  ];

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      {cards.map((m) => (
        <div key={m.label} className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <p className="text-xs font-medium text-slate-500">{m.label}</p>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-3xl font-semibold text-ink">
              {m.value ?? (state?.kind === "error" ? "—" : "…")}
            </p>
            {m.value !== null && (
              <StatusBadge tone={m.value > 0 ? m.tone : "neutral"}>{m.value > 0 ? "Active" : "None"}</StatusBadge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
