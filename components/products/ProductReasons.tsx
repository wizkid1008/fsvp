import Link from "next/link";
import { ArrowRight, ChevronDown, CircleAlert } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

/**
 * Why a product is not finished, and the button that fixes each reason.
 *
 * This used to be a page of its own — /setup/fsvp, the "FSVP Pipeline", then
 * briefly "What Needs Doing" — that listed every blocker grouped by stage. The
 * Products page beside it already said where each product stood, with a badge,
 * so there were two places answering "how is Potatoes doing?" and only the one
 * nobody opened said why. The reasons live with the product now, one click
 * deep at the top of its own page (see ProductWhatsLeft).
 *
 * No "use client": rendered by the dashboard on the server as well as inside
 * the Products table.
 */

export type ReasonItem = {
  id: string;
  message: string;
  href: string;
  actionLabel: string;
  stepNumber: number;
};

export type StageSummary = {
  id: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  open: number;
};

export function ReasonList({ reasons }: { reasons: ReasonItem[] }) {
  return (
    <ol className="space-y-2">
      {reasons.map((reason) => (
        <li
          key={reason.id}
          className="flex flex-col gap-2 rounded-md border border-line bg-white px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
        >
          <p className="min-w-0 text-sm leading-6 text-slate-700">{reason.message}</p>
          <Link
            href={reason.href}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-md border border-line bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
          >
            {reason.actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** Blockers about the account rather than any one product — they hold up all of them. */
export function AccountReasonsBanner({ reasons }: { reasons: ReasonItem[] }) {
  if (reasons.length === 0) return null;
  return (
    <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50/60 p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <CircleAlert className="h-4 w-4 text-amber-500" />
        {reasons.length === 1 ? "This is holding up every product" : "These are holding up every product"}
      </h2>
      <div className="mt-3">
        <ReasonList reasons={reasons} />
      </div>
    </section>
  );
}

/**
 * The eleven stages, as reference. Collapsed: the reasons above are the
 * worklist, and this only answers "what does a product go through?". Each
 * stage keeps the `gate-<id>` anchor older links point at; Chrome opens a
 * closed <details> when a fragment inside it is navigated to.
 */
export function StageReference({ stages }: { stages: StageSummary[] }) {
  return (
    <details className="group mt-8 rounded-lg border border-line bg-white shadow-soft">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-semibold text-ink">What does a product go through?</span>
          <span className="block text-xs text-slate-500">
            The {stages.length} stages, in order. A finished product can return to one when something
            it relied on expires.
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <ol className="border-t border-line">
        {stages.map((stage, index) => (
          <li
            key={stage.id}
            id={`gate-${stage.id}`}
            className="flex scroll-mt-6 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-5 py-3 last:border-b-0 target:bg-forest/5"
          >
            <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-slate-400">{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-ink">{stage.title}</span>
              <span className="block text-xs leading-5 text-slate-500">{stage.description}</span>
            </span>
            <StatusBadge tone={stage.open === 0 ? "success" : "warning"}>
              {stage.open === 0 ? "Clear" : `${stage.open} open`}
            </StatusBadge>
            <Link href={stage.href} className="text-xs font-semibold text-forest hover:underline">
              {stage.actionLabel}
            </Link>
          </li>
        ))}
      </ol>
    </details>
  );
}
