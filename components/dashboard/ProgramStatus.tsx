import { AlertTriangle } from "lucide-react";
import { RECORD_STAGES, type StageSummary } from "@/lib/fsvp/record-stages";

/**
 * Where the whole programme stands.
 *
 * The dashboard could say how many records were unsigned, how many products
 * lacked applicability, and how many things were gating approvals — six tiles
 * and three cards of it — without once saying the plainest thing: how many
 * records exist and how many are approved. Counts of what is wrong are not a
 * status; they are a worklist. This is the status.
 *
 * SHOWN AS A TRACK, NOT A PROPORTIONAL BAR
 *
 * The first attempt was one stacked bar sized by how many records sat in each
 * stage. On a real account it rendered as a single flat grey band, because
 * every record was in the first stage and the first stage was grey — visually
 * identical to an empty progress bar or a loading skeleton. It answered "what
 * proportion is where" when nobody had asked; the question is "how far along
 * is this programme", and a distribution across one stage cannot show it.
 *
 * All four stages are therefore always drawn, in order, with their counts. Two
 * records sitting at the start now reads as two records at the start of a
 * four-stage journey rather than as a bar that failed to load.
 */

const STAGE_FILL = [
  "bg-slate-400",   // evidence collection
  "bg-amber-400",   // submitted for review
  "bg-sky-400",     // importer review
  "bg-emerald-500", // approved & monitoring
];

export function ProgramStatus({ summary }: { summary: StageSummary }) {
  const { total, blocked, byStage, approved } = summary;

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
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RECORD_STAGES.map((stage, i) => {
            const count = byStage[i];
            return (
              <div key={stage.key}>
                {/* An empty stage keeps its slot and shows a hollow rail, so
                    the shape of the journey is visible from the first record
                    rather than appearing one stage at a time. */}
                <div
                  className={`h-1.5 w-full rounded-full ${count > 0 ? STAGE_FILL[i] : "bg-slate-100"}`}
                />
                <p
                  className={`mt-2 text-lg font-semibold ${
                    count > 0 ? "text-ink" : "text-slate-300"
                  }`}
                >
                  {count}
                </p>
                <p className="text-xs leading-4 text-slate-500">{stage.label}</p>
              </div>
            );
          })}
        </div>
      )}

      {blocked > 0 && (
        <p className="mt-3 border-t border-line pt-3 text-xs text-slate-500">
          {blocked} record{blocked === 1 ? " is" : "s are"} blocked and not on the track above —
          a blocked record has stopped wherever it had reached.
        </p>
      )}
    </section>
  );
}
