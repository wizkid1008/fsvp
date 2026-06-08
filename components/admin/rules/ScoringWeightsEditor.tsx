"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface SectionWeightRow {
  section_id: string;
  section_key: string;
  section_name: string;
  applies_to: "facility" | "product" | "supplier";
  weight_percent: number;
}

function WeightGroup({
  label,
  rows,
  isDraft,
  onChange,
}: {
  label: string;
  rows: SectionWeightRow[];
  isDraft: boolean;
  onChange: (sectionId: string, value: number) => void;
}) {
  const total = rows.reduce((sum, r) => sum + r.weight_percent, 0);
  const isValid = Math.abs(total - 100) < 0.1;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{label} Sections</h3>
        <span className={`text-sm font-semibold ${isValid ? "text-emerald-600" : "text-red-600"}`}>
          Total: {total.toFixed(1)}% {isValid ? "✓" : "— must equal 100%"}
        </span>
      </div>
      <div className="overflow-hidden rounded-md border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-slate-50">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Section</th>
              <th className="w-32 px-4 py-2.5 text-right font-semibold text-slate-600">Weight %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.section_id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-700">{row.section_name}</td>
                <td className="px-4 py-3 text-right">
                  {isDraft ? (
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={row.weight_percent}
                      onChange={(e) => onChange(row.section_id, parseFloat(e.target.value) || 0)}
                      className="w-20 rounded-md border border-line bg-white px-2 py-1 text-right text-sm text-ink focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest"
                    />
                  ) : (
                    <span className="font-semibold text-ink">{row.weight_percent}%</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ScoringWeightsEditor({
  versionId,
  isDraft,
  initialWeights,
}: {
  versionId: string;
  isDraft: boolean;
  initialWeights: SectionWeightRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [weights, setWeights] = useState<SectionWeightRow[]>(initialWeights);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleChange(sectionId: string, value: number) {
    setWeights((prev) => prev.map((w) => w.section_id === sectionId ? { ...w, weight_percent: value } : w));
    setSaved(false);
    setError(null);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/rules/weights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: versionId, weights }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setSaved(true);
      router.refresh();
    });
  }

  const facilityWeights = weights.filter((w) => w.applies_to === "facility");
  const productWeights = weights.filter((w) => w.applies_to === "product");

  return (
    <div className="space-y-6">
      <WeightGroup label="Facility" rows={facilityWeights} isDraft={isDraft} onChange={handleChange} />
      <WeightGroup label="Product" rows={productWeights} isDraft={isDraft} onChange={handleChange} />

      {isDraft && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save Weights"}
          </button>
          {saved && <StatusBadge tone="success">Saved</StatusBadge>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
