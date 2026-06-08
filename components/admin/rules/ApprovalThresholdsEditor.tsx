"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface ThresholdRow {
  id: string;
  label: string;
  min_score: number;
  max_score: number;
  resulting_status: string;
}

const RESULTING_STATUS_OPTIONS = [
  "importer_approved",
  "conditionally_approved",
  "needs_corrective_action",
  "rejected",
];

export function ApprovalThresholdsEditor({
  versionId,
  isDraft,
  initialThresholds,
}: {
  versionId: string;
  isDraft: boolean;
  initialThresholds: ThresholdRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [thresholds, setThresholds] = useState<ThresholdRow[]>(initialThresholds);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleChange(id: string, field: keyof ThresholdRow, value: string | number) {
    setThresholds((prev) => prev.map((t) => t.id === id ? { ...t, [field]: value } : t));
    setSaved(false);
    setError(null);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/rules/thresholds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: versionId, thresholds }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setSaved(true);
      router.refresh();
    });
  }

  const sorted = [...thresholds].sort((a, b) => b.min_score - a.min_score);

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-slate-50">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Label</th>
              <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Min Score</th>
              <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Max Score</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Resulting Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sorted.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  {isDraft ? (
                    <input value={t.label}
                      onChange={(e) => handleChange(t.id, "label", e.target.value)}
                      className="h-8 w-full rounded border border-line bg-white px-2 text-sm text-ink focus:border-forest focus:outline-none" />
                  ) : (
                    <span className="font-medium text-ink">{t.label}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {isDraft ? (
                    <input type="number" min={0} max={100} value={t.min_score}
                      onChange={(e) => handleChange(t.id, "min_score", parseFloat(e.target.value) || 0)}
                      className="h-8 w-16 rounded border border-line bg-white px-2 text-center text-sm text-ink focus:border-forest focus:outline-none" />
                  ) : (
                    <span className="font-semibold text-ink">{t.min_score}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {isDraft ? (
                    <input type="number" min={0} max={100} value={t.max_score}
                      onChange={(e) => handleChange(t.id, "max_score", parseFloat(e.target.value) || 0)}
                      className="h-8 w-16 rounded border border-line bg-white px-2 text-center text-sm text-ink focus:border-forest focus:outline-none" />
                  ) : (
                    <span className="font-semibold text-ink">{t.max_score}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {isDraft ? (
                    <select value={t.resulting_status}
                      onChange={(e) => handleChange(t.id, "resulting_status", e.target.value)}
                      className="h-8 rounded border border-line bg-white px-2 text-sm text-ink focus:border-forest focus:outline-none">
                      {RESULTING_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                      ))}
                    </select>
                  ) : (
                    <StatusBadge tone={
                      t.resulting_status === "importer_approved" ? "success" :
                      t.resulting_status === "conditionally_approved" ? "warning" :
                      t.resulting_status === "needs_corrective_action" ? "warning" : "danger"
                    }>
                      {t.resulting_status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </StatusBadge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isDraft && (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={handleSave} disabled={isPending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:opacity-50">
            {isPending ? "Saving…" : "Save Thresholds"}
          </button>
          {saved && <StatusBadge tone="success">Saved</StatusBadge>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
