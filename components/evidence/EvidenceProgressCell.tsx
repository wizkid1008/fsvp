import type { EvidenceProgress } from "@/lib/readiness/evidence-scope";

/**
 * The required-evidence breakdown for one exporter, facility or product row.
 *
 * All four counts, always in the same order, so rows can be compared down the
 * column at a glance. Zeros are dimmed rather than hidden: "0 returned" is
 * information, and a row whose lines come and go would not scan.
 *
 * No hooks, so it renders from both server and client tables.
 */
export const EVIDENCE_ROWS = [
  { key: "missing",        label: "Not submitted",   dot: "bg-slate-300",   bar: "bg-slate-200" },
  { key: "awaitingReview", label: "Awaiting review", dot: "bg-sky-500",     bar: "bg-sky-500" },
  { key: "accepted",       label: "Approved",        dot: "bg-emerald-500", bar: "bg-emerald-500" },
  { key: "needsAttention", label: "Returned",        dot: "bg-red-500",     bar: "bg-red-500" },
] as const;

/** Bar order: done on the left, not started on the right. */
const BAR_ORDER = ["accepted", "awaitingReview", "needsAttention", "missing"] as const;

export function EvidenceProgressBar({ progress }: { progress: EvidenceProgress }) {
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      {BAR_ORDER.map((key) => {
        const count = progress[key];
        const row = EVIDENCE_ROWS.find((r) => r.key === key)!;
        return count > 0 && progress.required > 0 ? (
          <span key={key} className={row.bar} style={{ width: `${(count / progress.required) * 100}%` }} />
        ) : null;
      })}
    </div>
  );
}

export function EvidenceProgressCell({
  href,
  progress,
  noun = "documents",
}: {
  href: string;
  progress: EvidenceProgress;
  noun?: string;
}) {
  return (
    <a
      href={href}
      className="group block min-w-[9.5rem]"
      title={`${progress.required} required ${noun}`}
    >
      <EvidenceProgressBar progress={progress} />
      <ul className="mt-1.5 space-y-0.5">
        {EVIDENCE_ROWS.map((row) => {
          const count = progress[row.key];
          return (
            <li
              key={row.key}
              className={`flex items-center gap-1.5 text-xs ${count === 0 ? "text-slate-300" : "text-slate-600"}`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${count === 0 ? "bg-slate-200" : row.dot}`} />
              <span className="w-4 text-right font-semibold tabular-nums">{count}</span>
              <span className="group-hover:text-forest">{row.label}</span>
            </li>
          );
        })}
      </ul>
    </a>
  );
}

/** Every required item is in and none is sent back, but some are undecided. */
export function isAwaitingReview(p: EvidenceProgress | undefined): boolean {
  return !!p && p.missing === 0 && p.needsAttention === 0 && p.awaitingReview > 0;
}
