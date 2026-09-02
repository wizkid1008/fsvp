import { AlertTriangle } from "lucide-react";
import { RECORD_STAGES, type StageSummary } from "@/lib/fsvp/record-stages";

/**
 * Where the whole programme stands, in one bar.
 *
 * The dashboard could say how many records were unsigned, how many products
 * lacked applicability, and how many things were gating approvals — six tiles
 * and three cards of it — without once saying the plainest thing: how many
 * records exist and how many are approved. Counts of what is wrong are not a
 * status; they are a worklist. This is the status.
 *
 * One stacked bar rather than four numbers, because the question an importer
 * opens the app with is proportional — "are we mostly through?" — and a row of
 * counts makes the reader do that arithmetic themselves.
 */

const STAGE_FILL = [
  "bg-slate-300",   // evidence collection
  "bg-amber-400",   // submitted for review
  "bg-sky-400",     // importer review
  "bg-emerald-500", // approved & monitoring
];

export function ProgramStatus({ summary }: { summary: StageSummary }) {
  const { total, blocked, byStage, approved } = summary;

  // Percentages rather than flex weights: a stage holding one record out of
  // twenty still has to be visible, and a bare flex-grow would render it as a
  // sliver a person cannot see or hover.
  const segments = [
    ...(blocked > 0 ? [{ key: "blocked", count: blocked, fill: "bg-red-500", label: "Blocked" }] : []),
    ...RECORD_STAGES.map((stage, i) => ({
      key: stage.key,
      count: byStage[i],
      fill: STAGE_FILL[i],
      label: stage.label,
    })).filter((s) => s.count > 0),
  ];

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Programme status</h2>
          <p className="mt-1 text-sm text-slate-500">
            {total === 0
              ? "No FSVP records yet. One is opened per facility and product you import."
              : `${approved} of ${total} record${total === 1 ? "" : "s"} approved and in monitoring.`}
          </p>
        </div>
        {blocked > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {blocked} blocked
          </span>
        )}
      </div>

      {total > 0 && (
        <>
          <div
            className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
            role="img"
            aria-label={segments.map((s) => `${s.count} ${s.label}`).join(", ")}
          >
            {segments.map((s) => (
              <div
                key={s.key}
                className={s.fill}
                style={{ width: `${(s.count / total) * 100}%` }}
                title={`${s.count} ${s.label}`}
              />
            ))}
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {segments.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.fill}`} />
                <span className="font-semibold text-ink">{s.count}</span>
                {s.label}
              </li>
            ))}
          </ul>
        </>
      )}

    </section>
  );
}
