"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";
import { ChevronDown } from "lucide-react";
import { AccountReasonsBanner, ReasonList, StageReference, type ReasonItem, type StageSummary } from "@/components/products/ProductReasons";

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
  standings: Record<string, { phase: string; label: string; blocked: boolean; reasons: ReasonItem[] }>;
  approved: number;
  blocked: number;
  /** Blockers about the account itself, which hold up every product. */
  accountReasons: ReasonItem[];
  /** The eleven stages, for the reference list under the table. */
  stages: StageSummary[];
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

/** This product's reasons, or [] while loading, on error, or when it has none. */
export function useProductReasons(productId: string): ReasonItem[] {
  const state = useProductStandings();
  return state?.kind === "ready" ? state.data.standings[productId]?.reasons ?? [] : [];
}

/**
 * The status badge, plus a toggle that opens the product's reasons in a row
 * beneath it (ProductTable renders that row — a table cell is too narrow, and
 * the table clips anything that overflows it).
 */
export function ProductFsvpStatus({
  productId,
  expanded = false,
  onToggle,
}: {
  productId: string;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const state = useProductStandings();
  if (!state || state.kind === "loading") return <span className="text-xs text-slate-400">…</span>;
  if (state.kind === "error") return <span className="text-xs text-slate-400" title="Could not load">—</span>;
  const standing = state.data.standings[productId];
  // The pipeline covers foods currently imported; a discontinued or
  // never-imported product has no standing, and the Imported column says why.
  if (!standing) return <span className="text-xs text-slate-400" title="Not in the FSVP pipeline">—</span>;
  const count = standing.reasons.length;
  return (
    <div>
      <StatusBadge tone={toneFor(standing.phase)}>{standing.label}</StatusBadge>
      {count > 0 && onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="mt-1 flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-forest hover:underline"
        >
          {expanded ? "Hide" : `Why? ${count} to do`}
          <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}

/** The expanded row's content: why this product is not finished. */
export function ProductReasonsPanel({ productId, productName }: { productId: string; productName: string }) {
  const reasons = useProductReasons(productId);
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Why {productName} isn&apos;t finished
      </p>
      <ReasonList reasons={reasons} />
    </div>
  );
}

/** Account-wide blockers, above the Products table. */
export function ProductsAccountReasons() {
  const state = useProductStandings();
  return state?.kind === "ready" ? <AccountReasonsBanner reasons={state.data.accountReasons} /> : null;
}

/** The stage reference, below the Products table. */
export function ProductsStageReference() {
  const state = useProductStandings();
  return state?.kind === "ready" ? <StageReference stages={state.data.stages} /> : null;
}

/**
 * The top of a product's own page: what is left for this one product. Says
 * nothing while loading or on error — the rest of the page stands on its own.
 */
export function ProductWhatsLeft({ productId }: { productId: string }) {
  const state = useProductStandings();
  if (state?.kind !== "ready") return null;
  const standing = state.data.standings[productId];
  if (!standing) return null;
  const reasons = standing.reasons;
  if (reasons.length === 0) {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3">
        <StatusBadge tone={toneFor(standing.phase)}>{standing.label}</StatusBadge>
        <p className="text-sm text-emerald-900">Nothing is left to do for this product.</p>
      </div>
    );
  }
  return (
    <section className="mt-6 rounded-lg border border-line bg-slate-50 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-ink">
          What&apos;s left for this product
        </h2>
        <StatusBadge tone={toneFor(standing.phase)}>{standing.label}</StatusBadge>
      </div>
      <div className="mt-3">
        <ReasonList reasons={reasons} />
      </div>
    </section>
  );
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
