"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ClipboardCheck } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

type VerificationRecord = {
  id: string;
  activity_type: string;
  status: string;
  scheduled_date: string | null;
  completed_at: string | null;
  result: string | null;
  result_notes: string | null;
  is_sahcodha_audit: boolean;
  performed_by_name: string | null;
  next_due_at: string | null;
};

function resultTone(r: string | null): StatusTone {
  if (r === "acceptable") return "success";
  if (r === "unacceptable") return "danger";
  if (r === "inconclusive") return "warning";
  return "neutral";
}

function statusTone(s: string): StatusTone {
  if (s === "completed") return "success";
  if (s === "overdue") return "danger";
  if (s === "in_progress") return "info";
  if (s === "cancelled") return "neutral";
  return "warning";
}

const ACTIVITY_LABELS: Record<string, string> = {
  onsite_audit:              "On-site Audit",
  sampling_testing:          "Sampling & Testing",
  records_review:            "Records Review",
  certificate_of_conformance:"Certificate of Conformance",
  written_assurance:         "Written Assurance",
  other:                     "Other",
};

function AddVerificationForm({ recordId, onDone }: { recordId: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      try {
        const res = await fetch("/api/fsvp/verification-records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fsvp_record_id: recordId,
            activity_type: fd.get("activity_type"),
            scheduled_date: fd.get("scheduled_date") || null,
            performed_by_name: fd.get("performed_by_name") || null,
            next_due_at: fd.get("next_due_at") || null,
            is_sahcodha_audit: fd.get("is_sahcodha_audit") === "on",
            result_notes: fd.get("result_notes") || null,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        router.refresh();
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add record");
      }
    });
  }

  const inputClass = "mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
  const labelClass = "block text-xs font-medium text-slate-600";

  return (
    <form onSubmit={submit} className="mt-4 rounded-lg border border-line bg-slate-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-ink">Add Verification Activity</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Activity Type <span className="text-red-500">*</span>
          <select name="activity_type" required className={inputClass}>
            <option value="">Select…</option>
            {Object.entries(ACTIVITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Scheduled Date
          <input type="date" name="scheduled_date" className={inputClass} />
        </label>
        <label className={labelClass}>
          Next Due
          <input type="date" name="next_due_at" className={inputClass} />
        </label>
        <label className={labelClass}>
          Performed By (QI name)
          <input name="performed_by_name" placeholder="Name" className={inputClass} />
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 mt-5 col-span-2">
          <input type="checkbox" name="is_sahcodha_audit" className="h-4 w-4 rounded border-line" />
          SAHCODHA audit (§ 1.506(b)(2)) — must be onsite audit, cannot use assurance substitution
        </label>
      </div>
      <label className={labelClass}>
        Notes
        <textarea
          name="result_notes"
          rows={2}
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest"
          placeholder="Initial notes or scope…"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending}
          className="h-8 rounded-md bg-forest px-4 text-xs font-semibold text-white hover:bg-[#195f4d] disabled:opacity-50">
          {pending ? "Adding…" : "Add Activity"}
        </button>
        <button type="button" onClick={onDone}
          className="h-8 rounded-md border border-line px-4 text-xs font-medium text-slate-600 hover:bg-white">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function VerificationRecordsPanel({
  recordId,
  records,
  readonly,
}: {
  recordId: string;
  records: VerificationRecord[];
  readonly: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);

  if (records.length === 0 && !showAdd) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <ClipboardCheck className="h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-600">No verification activities yet</p>
        <p className="mt-1 text-xs text-slate-400">
          Document audits, sampling, records reviews, and certificates of conformance.
        </p>
        {!readonly && (
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-[#195f4d]"
          >
            <Plus className="h-4 w-4" />
            Add First Activity
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{records.length} activit{records.length === 1 ? "y" : "ies"} on record</p>
        {!readonly && !showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Activity
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-slate-50">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Activity</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Scheduled</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Completed</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Result</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Next Due</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {records.map((r) => {
              const overdue = r.next_due_at && new Date(r.next_due_at) <= new Date() && r.status !== "completed";
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{ACTIVITY_LABELS[r.activity_type] ?? r.activity_type}</p>
                    {r.is_sahcodha_audit && (
                      <span className="inline-block rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        SAHCODHA
                      </span>
                    )}
                    {r.performed_by_name && (
                      <p className="text-xs text-slate-400">{r.performed_by_name}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {r.scheduled_date ? new Date(r.scheduled_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {r.completed_at ? new Date(r.completed_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.result ? (
                      <StatusBadge tone={resultTone(r.result)}>
                        {r.result.charAt(0).toUpperCase() + r.result.slice(1)}
                      </StatusBadge>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.next_due_at ? (
                      <span className={overdue ? "font-semibold text-red-600" : "text-slate-500"}>
                        {new Date(r.next_due_at).toLocaleDateString()}
                        {overdue && " ⚠"}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={statusTone(r.status)}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1).replace(/_/g, " ")}
                    </StatusBadge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddVerificationForm recordId={recordId} onDone={() => setShowAdd(false)} />
      )}
    </div>
  );
}
