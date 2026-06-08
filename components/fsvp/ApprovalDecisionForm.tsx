"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

type Decision = "approved" | "conditionally_approved" | "rejected" | "revision_requested";

const DECISIONS: Array<{
  value: Decision;
  label: string;
  description: string;
  tone: StatusTone;
  icon: React.ElementType;
}> = [
  {
    value: "approved",
    label: "Approved",
    description: "This supplier/facility/product combination is approved for import.",
    tone: "success",
    icon: CheckCircle2,
  },
  {
    value: "conditionally_approved",
    label: "Conditionally Approved",
    description: "Approved with conditions. Specify conditions below.",
    tone: "warning",
    icon: AlertCircle,
  },
  {
    value: "revision_requested",
    label: "Request Revision",
    description: "Send back for additional evidence or corrections.",
    tone: "info",
    icon: RefreshCw,
  },
  {
    value: "rejected",
    label: "Rejected",
    description: "This combination is not approved for import.",
    tone: "danger",
    icon: XCircle,
  },
];

export function ApprovalDecisionForm({
  recordId,
  currentDecision,
}: {
  recordId: string;
  currentDecision: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Decision | null>(null);
  const [notes, setNotes] = useState("");
  const [conditions, setConditions] = useState("");
  const [months, setMonths] = useState(12);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!selected) { setError("Select a decision."); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/fsvp-records/${recordId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: selected,
          decision_notes: notes.trim() || undefined,
          conditions_text: selected === "conditionally_approved" ? conditions.trim() || undefined : undefined,
          reassessment_months: months,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      router.refresh();
    });
  }

  if (currentDecision && currentDecision !== "needs_corrective_action") {
    const decisionTone: Record<string, StatusTone> = {
      importer_approved: "success",
      conditionally_approved: "warning",
      rejected: "danger",
    };
    return (
      <div className="rounded-lg border border-line bg-slate-50 p-4">
        <div className="flex items-center gap-3">
          <StatusBadge tone={decisionTone[currentDecision] ?? "neutral"}>
            {currentDecision.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </StatusBadge>
          <p className="text-sm text-slate-600">Decision recorded. Clone the record to re-evaluate.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {DECISIONS.map((d) => {
          const Icon = d.icon;
          return (
            <button
              key={d.value}
              type="button"
              onClick={() => setSelected(d.value)}
              className={`rounded-lg border p-4 text-left transition ${
                selected === d.value
                  ? "border-forest bg-emerald-50 ring-1 ring-forest"
                  : "border-line bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${
                  d.value === "approved" ? "text-emerald-600" :
                  d.value === "conditionally_approved" ? "text-amber-600" :
                  d.value === "rejected" ? "text-red-600" : "text-sky-600"
                }`} />
                <span className="text-sm font-semibold text-ink">{d.label}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{d.description}</p>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="space-y-3">
          {selected === "conditionally_approved" && (
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Conditions <span className="text-red-500">*</span>
              </label>
              <textarea
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                rows={3}
                placeholder="Describe the conditions that must be met…"
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm text-ink placeholder-slate-400 focus:border-forest focus:outline-none resize-none"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional rationale or notes for the record…"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm text-ink placeholder-slate-400 focus:border-forest focus:outline-none resize-none"
            />
          </div>
          {(selected === "approved" || selected === "conditionally_approved") && (
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Reassessment frequency (months)
              </label>
              <select
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className="mt-1 h-10 rounded-md border border-line bg-white px-3 text-sm text-ink focus:border-forest focus:outline-none"
              >
                {[6, 12, 18, 24, 36].map((m) => (
                  <option key={m} value={m}>{m} months</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={isPending || !selected}
        className="inline-flex h-10 items-center rounded-md bg-forest px-6 text-sm font-semibold text-white hover:bg-[#195f4d] disabled:opacity-50"
      >
        {isPending ? "Recording decision…" : "Record Decision"}
      </button>
    </div>
  );
}
