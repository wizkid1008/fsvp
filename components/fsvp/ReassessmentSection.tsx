"use client";

import { useState } from "react";
import { BeginReassessmentModal } from "./BeginReassessmentModal";

interface Schedule {
  id: string;
  frequency_months: number;
  next_due_at: string;
  last_assessed_at: string | null;
}

interface Props {
  fsvpRecordId: string;
  schedule: Schedule | null;
}

export function ReassessmentSection({ fsvpRecordId, schedule }: Props) {
  const [showModal, setShowModal] = useState(false);

  if (!schedule) return null;

  const isOverdue = new Date(schedule.next_due_at) <= new Date();

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-semibold text-ink">Reassessment Schedule</h2>
        {isOverdue && (
          <button
            onClick={() => setShowModal(true)}
            className="shrink-0 rounded-lg bg-forest px-3 py-1.5 text-sm font-semibold text-white hover:bg-forest/90"
          >
            Begin Reassessment
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-3 text-sm">
        <div>
          <p className="text-xs font-medium text-slate-500">Frequency</p>
          <p className="mt-1 font-semibold text-ink">Every {schedule.frequency_months} months</p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Last Assessed</p>
          <p className="mt-1 font-semibold text-ink">
            {schedule.last_assessed_at
              ? new Date(schedule.last_assessed_at).toLocaleDateString()
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Next Due</p>
          <p className={`mt-1 font-semibold ${isOverdue ? "text-red-600" : "text-ink"}`}>
            {new Date(schedule.next_due_at).toLocaleDateString()}
            {isOverdue && <span className="ml-2 text-xs font-normal">(overdue)</span>}
          </p>
        </div>
      </div>

      {!isOverdue && (
        <p className="mt-3 text-xs text-slate-400">
          The "Begin Reassessment" button will appear when the due date is reached.
        </p>
      )}

      {showModal && (
        <BeginReassessmentModal
          fsvpRecordId={fsvpRecordId}
          scheduleId={schedule.id}
          frequencyMonths={schedule.frequency_months}
          onClose={() => setShowModal(false)}
        />
      )}
    </section>
  );
}
