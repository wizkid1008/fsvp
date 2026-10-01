"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { ReasonList, StageReference, type ReasonItem, type StageSummary } from "@/components/products/ProductReasons";
import { ProductCountCards, type ProductCounts } from "@/components/products/ProductCountCards";

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
  /** Products whose admissibility is prohibited — Entry Readiness's "Do Not Ship". */
  doNotShip: number;
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
  if (phase === "blocked" || phase === "do_not_ship") return "danger";
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

/**
 * The Products list's "Next step": the first thing holding this product up,
 * as a link to the screen that clears it, plus how many more are behind it.
 * The same reasons, in the same order, as "What's left" on the product's own
 * page — this is that list's first line, not a separate judgement. It replaced
 * Entry Readiness's "Next Action" column, which made its own and disagreed.
 */
export function ProductNextStep({ productId }: { productId: string }) {
  const state = useProductStandings();
  if (!state || state.kind === "loading") return <span className="text-xs text-slate-400">…</span>;
  if (state.kind === "error") return <span className="text-xs text-slate-400">—</span>;
  const reasons = state.data.standings[productId]?.reasons ?? [];
  if (reasons.length === 0) return <span className="text-xs text-slate-400">Nothing left</span>;
  const [first, ...rest] = reasons;
  return (
    <div className="min-w-0">
      <Link href={first.href} title={first.message} className="text-sm font-semibold text-forest hover:underline">
        {first.actionLabel}
      </Link>
      {rest.length > 0 && (
        <Link href={`/products/${productId}#whats-left`} className="block text-xs text-slate-500 hover:text-forest hover:underline">
          +{rest.length} more
        </Link>
      )}
    </div>
  );
}

/**
 * The top of a product's own page: what is left for this one product.
 *
 * Collapsed to one line until clicked. The reasons were briefly opened under
 * each row of the Products list and then spelled out on this page in full,
 * and both were too much at once: the list is for finding a product, and this
 * page already carries its details and documents. So the list shows only the
 * status, and here it is one line — "3 things left" — that opens the reasons,
 * each with its fix button, and the stage reference beneath them.
 *
 * Says nothing while loading or on error — the rest of the page stands alone.
 */
export function ProductWhatsLeft({ productId }: { productId: string }) {
  const state = useProductStandings();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const ready = state?.kind === "ready";

  // Arriving from the Products list's "+2 more" (#whats-left): the section
  // renders only after the standings load, too late for the browser's own
  // jump to the fragment, so open it and scroll to it once it exists.
  useEffect(() => {
    if (!ready || window.location.hash !== "#whats-left" || !detailsRef.current) return;
    detailsRef.current.open = true;
    detailsRef.current.scrollIntoView({ block: "start" });
  }, [ready]);

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
    <details ref={detailsRef} className="group mt-6 scroll-mt-6 rounded-lg border border-line bg-white shadow-soft">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-5 py-3 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <StatusBadge tone={toneFor(standing.phase)}>{standing.label}</StatusBadge>
        <span className="text-sm font-semibold text-ink">
          {reasons.length} thing{reasons.length === 1 ? "" : "s"} left before this product is finished
        </span>
        <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-forest">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span>
          <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
        </span>
      </summary>
      {/* Anchored inside the <details>, so a link to #whats-left (the list's
          "+2 more") opens it: Chrome expands a closed details when a fragment
          inside it is navigated to. */}
      <div id="whats-left" className="scroll-mt-6 border-t border-line bg-slate-50 p-5">
        <ReasonList reasons={reasons} />
        <StageReference stages={state.data.stages} />
      </div>
    </details>
  );
}

/** The Products page's cards, counted as the dashboard counts them. */
export function ProductStatusCards() {
  const state = useProductStandings();
  // Counted exactly as the Dashboard counts them — see ProductCountCards.
  const counts: ProductCounts | null =
    state?.kind === "ready"
      ? {
          total: Object.keys(state.data.standings).length,
          needsAction: Object.values(state.data.standings).filter((s) => s.reasons.length > 0).length,
          approved: state.data.approved,
          blocked: state.data.blocked,
          doNotShip: state.data.doNotShip,
        }
      : null;

  return (
    <div className="mt-6">
      <ProductCountCards counts={counts} placeholder={state?.kind === "error" ? "—" : "…"} />
    </div>
  );
}
