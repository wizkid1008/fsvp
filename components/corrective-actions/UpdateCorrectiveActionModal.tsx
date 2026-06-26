"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export interface ActionRow {
  id: string;
  issue_description: string;
  triggered_by: string;
  status: string;
  triggered_at: string;
  closed_at: string | null;
  supplier_id: string;
  food_id: string | null;
  investigation_summary: string | null;
  action_taken: string | null;
  decision: string | null;
}

interface Props {
  action: ActionRow;
  onClose: () => void;
}

export function UpdateCorrectiveActionModal({ action, onClose }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(action.status);
  const [investigationSummary, setInvestigationSummary] = useState(action.investigation_summary ?? "");
  const [actionTaken, setActionTaken] = useState(action.action_taken ?? "");
  const [decision, setDecision] = useState(action.decision ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        status,
        investigation_summary: investigationSummary,
        action_taken: actionTaken,
      };
      if (status === "closed" && decision) body.decision = decision;

      const res = await fetch(`/api/corrective-actions/${action.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to update corrective action");
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
          <h2 className="text-base font-semibold text-ink">Update Corrective Action</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <p className="text-sm text-slate-600 rounded-lg bg-slate-50 border border-line px-3 py-2">
            {action.issue_description}
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Investigation Summary</label>
            <textarea
              value={investigationSummary}
              onChange={(e) => setInvestigationSummary(e.target.value)}
              placeholder="Describe the root cause investigation…"
              rows={3}
              className="w-full resize-y rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-forest focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Action Taken</label>
            <textarea
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              placeholder="Describe corrective actions taken…"
              rows={3}
              className="w-full resize-y rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-forest focus:outline-none"
            />
          </div>

          {status === "closed" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Decision</label>
              <select
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
              >
                <option value="">Select decision…</option>
                <option value="continued">Continue relationship</option>
                <option value="temporary_suspension">Temporary suspension</option>
                <option value="discontinued">Discontinue relationship</option>
              </select>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
