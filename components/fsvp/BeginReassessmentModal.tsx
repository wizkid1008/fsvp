"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

interface Props {
  fsvpRecordId: string;
  scheduleId: string;
  frequencyMonths: number;
  onClose: () => void;
}

export function BeginReassessmentModal({ fsvpRecordId, scheduleId, frequencyMonths, onClose }: Props) {
  const router = useRouter();
  const today = new Date().toISOString().split("T")[0];

  const [findings, setFindings] = useState("");
  const [changesRequired, setChangesRequired] = useState(false);
  const [changesDescription, setChangesDescription] = useState("");
  const [performedAt, setPerformedAt] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/fsvp-records/${fsvpRecordId}/reassess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: scheduleId,
          findings,
          changes_required: changesRequired,
          changes_description: changesDescription,
          performed_at: performedAt,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to record reassessment");
      }

      router.refresh();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Record Reassessment</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <p className="text-sm text-slate-500">
            Document the results of this FSVP reassessment. The next due date will be set to{" "}
            <span className="font-medium text-ink">{frequencyMonths} months</span> from the performed date.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Performed Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={performedAt}
              max={today}
              onChange={(e) => setPerformedAt(e.target.value)}
              required
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Findings</label>
            <textarea
              value={findings}
              onChange={(e) => setFindings(e.target.value)}
              placeholder="Summarize what was reviewed and any observations…"
              rows={4}
              className="w-full resize-y rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-forest focus:outline-none"
            />
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-line bg-slate-50 p-3">
            <input
              id="changes_required"
              type="checkbox"
              checked={changesRequired}
              onChange={(e) => setChangesRequired(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-forest"
            />
            <label htmlFor="changes_required" className="text-sm text-slate-700">
              Changes to the supplier program are required
            </label>
          </div>

          {changesRequired && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Describe Required Changes</label>
              <textarea
                value={changesDescription}
                onChange={(e) => setChangesDescription(e.target.value)}
                placeholder="Describe what changes need to be made…"
                rows={3}
                className="w-full resize-y rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-forest focus:outline-none"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !performedAt}
              className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Record Reassessment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
