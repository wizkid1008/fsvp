import Link from "next/link";
import { AlertTriangle, ArrowRight, Plus } from "lucide-react";
import { RECORD_STAGES, nextGateFor, recordProgress } from "@/lib/fsvp/record-stages";
import type { FsvpRecordStatus } from "@/types/database";

export type ProgressRecord = {
  id: string;
  status: FsvpRecordStatus;
  reassessment_due_at: string | null;
  facility_name: string | null;
  product_name: string | null;
};

/**
 * Each record on its way through, with a bar showing how far it has got.
 *
 * This replaces the five-column kanban. The board answered "what is in each
 * column", which on an account with two records meant eight empty cells and
 * two cards — most of the section spent saying nothing. A reader who wants to
 * know where ONE record stands had to find its card and then work out which
 * column it was under.
 *
 * A row per record answers that directly, stays legible at two records or
 * forty, and names the stage in words instead of by position. The counts the
 * board gave are in the programme bar above, where a proportional question
 * belongs.
 */

const SEGMENT_FILL = [
  "bg-slate-400",
  "bg-amber-400",
  "bg-sky-400",
  "bg-emerald-500",
];

/**
 * What this record needs, preferring a date over a phrase when there is one.
 *
 * A reassessment with a date on it is more useful than "In monitoring", so the
 * date wins wherever it exists; everything else defers to nextGateFor.
 */
function gateFor(record: ProgressRecord, hasSignature: boolean): string {
  const due = record.reassessment_due_at;
  if (due && !["needs_corrective_action", "rejected", "expired"].includes(record.status)) {
    const when = new Date(due).toLocaleDateString(undefined, { month: "short", year: "numeric" });
    return new Date(due) <= new Date()
      ? `Reassessment overdue — ${when}`
      : `Reassessment due ${when}`;
  }
  return nextGateFor(record.status, hasSignature);
}

export function RecordProgressList({
  records,
  unsignedRecordIds = [],
}: {
  records: ProgressRecord[];
  /** Records with no qualified individual signature, so a row can say so. */
  unsignedRecordIds?: string[];
}) {
  const unsigned = new Set(unsignedRecordIds);
  if (records.length === 0) {
    return (
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <h2 className="mb-1 text-sm font-semibold text-ink">Records in progress</h2>
        <p className="text-sm text-slate-500">
          No records yet — add a facility and product, then open a record to begin.
        </p>
      </section>
    );
  }

  // Blocked first: it is the only group that cannot move without a person.
  const ordered = [...records].sort((a, b) => {
    const pa = recordProgress(a.status);
    const pb = recordProgress(b.status);
    if (pa.blocked !== pb.blocked) return pa.blocked ? -1 : 1;
    return pa.fraction - pb.fraction;
  });

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Records in progress</h2>
        <Link
          href="/facilities"
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:border-forest hover:text-forest"
        >
          <Plus className="h-3.5 w-3.5" />
          Add facility or product
        </Link>
      </div>

      <ul className="divide-y divide-line">
        {ordered.map((record) => {
          const progress = recordProgress(record.status);
          const overdue =
            !!record.reassessment_due_at && new Date(record.reassessment_due_at) <= new Date();
          // Approved and not yet due back: the gate line is a statement, not a
          // task, so it should not wear the colour the tasks wear.
          const settled = progress.stageIndex === RECORD_STAGES.length - 1 && !overdue;
          return (
            <li key={record.id}>
              <Link
                href={`/fsvp-records/${record.id}`}
                className="group flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink group-hover:text-forest">
                    {record.facility_name ?? "Facility"}
                    {record.product_name && (
                      <span className="font-normal text-slate-400"> · {record.product_name}</span>
                    )}
                  </p>
                  {/* The actionable line. The stage under the bar says where
                      this record is; this says what would move it, which is
                      what someone scanning for their next task is reading. */}
                  <p
                    className={`truncate text-xs font-medium ${
                      progress.blocked
                        ? "text-red-600"
                        : overdue
                        ? "text-red-600"
                        : settled
                        ? "text-slate-500"
                        : "text-amber-700"
                    }`}
                  >
                    {gateFor(record, !unsigned.has(record.id))}
                  </p>
                </div>

                <div className="w-full sm:w-64">
                  <div className="flex gap-1" aria-hidden="true">
                    {RECORD_STAGES.map((stage, i) => (
                      <div
                        key={stage.key}
                        className={`h-1.5 flex-1 rounded-full ${
                          progress.blocked
                            ? "bg-red-200"
                            : i <= progress.stageIndex
                            ? SEGMENT_FILL[i]
                            : "bg-slate-100"
                        }`}
                      />
                    ))}
                  </div>
                  <p
                    className={`mt-1.5 text-xs font-medium ${
                      progress.blocked ? "text-red-600" : "text-slate-600"
                    }`}
                  >
                    {progress.blocked ? (
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Blocked
                      </span>
                    ) : (
                      <>
                        {progress.stageLabel}
                        <span className="text-slate-400">
                          {" "}· {progress.stageIndex + 1} of {progress.totalStages}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-300 group-hover:text-forest sm:block" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
