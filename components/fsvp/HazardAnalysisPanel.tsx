"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronDown, ChevronRight, ShieldAlert, Check, Undo2, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

type HazardItem = {
  id: string;
  hazard_type: "biological" | "chemical" | "physical" | "radiological";
  hazard_name: string;
  requires_control: boolean;
  severity: string | null;
  is_sahcodha: boolean;
  controlling_entity: string | null;
  controls_description: string | null;
};

type HazardAnalysis = {
  id: string;
  version: number;
  status: string;
  methodology_notes: string | null;
  relied_on_other_party: boolean;
  relied_on_party_name: string | null;
  performed_by_name: string | null;
  performed_at: string | null;
  next_reassessment_due_at: string | null;
  requires_supplier_verification: boolean;
  items: HazardItem[];
};

const HAZARD_TYPE_COLORS: Record<string, string> = {
  biological:   "bg-red-50 text-red-700 border-red-200",
  chemical:     "bg-amber-50 text-amber-700 border-amber-200",
  physical:     "bg-blue-50 text-blue-700 border-blue-200",
  radiological: "bg-purple-50 text-purple-700 border-purple-200",
};

function severityTone(s: string | null) {
  if (s === "high") return "danger";
  if (s === "moderate") return "warning";
  return "neutral";
}

function AddHazardItemForm({
  analysisId,
  onDone,
}: {
  analysisId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const res = await fetch("/api/fsvp/hazard-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hazard_analysis_id: analysisId,
            hazard_type: fd.get("hazard_type"),
            hazard_name: fd.get("hazard_name"),
            requires_control: fd.get("requires_control") === "true",
            severity: fd.get("severity") || null,
            is_sahcodha: fd.get("is_sahcodha") === "on",
            controlling_entity: fd.get("controlling_entity") || null,
            controls_description: fd.get("controls_description") || null,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        router.refresh();
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add hazard");
      }
    });
  }

  const inputClass = "mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
  const labelClass = "block text-xs font-medium text-slate-600";

  return (
    <form onSubmit={submit} className="mt-4 rounded-lg border border-line bg-slate-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-ink">Add Hazard</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Hazard Type <span className="text-red-500">*</span>
          <select name="hazard_type" required className={inputClass}>
            <option value="">Select…</option>
            <option value="biological">Biological</option>
            <option value="chemical">Chemical</option>
            <option value="physical">Physical</option>
            <option value="radiological">Radiological</option>
          </select>
        </label>
        <label className={labelClass}>
          Hazard Name <span className="text-red-500">*</span>
          <input name="hazard_name" required placeholder="e.g. Salmonella, Aflatoxin" className={inputClass} />
        </label>
        <label className={labelClass}>
          Requires Control
          <select name="requires_control" className={inputClass}>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <label className={labelClass}>
          Severity
          <select name="severity" className={inputClass}>
            <option value="">—</option>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
          </select>
        </label>
        <label className={labelClass}>
          Controlling Entity
          <select name="controlling_entity" className={inputClass}>
            <option value="">—</option>
            <option value="foreign_supplier">Foreign Supplier</option>
            <option value="supplier_of_supplier">Supplier of Supplier</option>
            <option value="importer">Importer</option>
            <option value="customer">Customer</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 mt-5">
          <input type="checkbox" name="is_sahcodha" className="h-4 w-4 rounded border-line" />
          SAHCODHA hazard (§ 1.506(b)(2))
        </label>
      </div>
      <label className={labelClass}>
        Controls Description
        <textarea
          name="controls_description"
          rows={2}
          className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest"
          placeholder="Describe the controls in place…"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-8 rounded-md bg-forest px-4 text-xs font-semibold text-white hover:bg-[#195f4d] disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add Hazard"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-8 rounded-md border border-line px-4 text-xs font-medium text-slate-600 hover:bg-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function HazardAnalysisPanel({
  recordId,
  analysis,
  readonly,
}: {
  recordId: string;
  analysis: HazardAnalysis | null;
  readonly: boolean;
}) {
  const router = useRouter();
  const [creating, startCreate] = useTransition();
  const [showAddItem, setShowAddItem] = useState(false);
  // A finished analysis opens closed: the header already says what it is, and
  // a completed section that still sprawls reads as unfinished work.
  const [expanded, setExpanded] = useState(analysis?.status !== "final");
  const [error, setError] = useState<string | null>(null);
  const [pendingFinality, startFinality] = useTransition();

  function createAnalysis() {
    setError(null);
    startCreate(async () => {
      try {
        const res = await fetch("/api/fsvp/hazard-analyses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fsvp_record_id: recordId }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create analysis");
      }
    });
  }

  /**
   * Finalize, or reopen to correct. Both go through the same PATCH, which
   * enforces what this cannot: at least one hazard item, an undecided record,
   * and the caller's tenancy. The button only decides which one to ask for.
   */
  function setFinality(action: "finalize" | "reopen") {
    setError(null);
    startFinality(async () => {
      try {
        const res = await fetch("/api/fsvp/hazard-analyses", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hazard_analysis_id: analysis?.id, action }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update the analysis");
      }
    });
  }

  function removeItem(itemId: string) {
    setError(null);
    startFinality(async () => {
      try {
        const res = await fetch("/api/fsvp/hazard-items", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: itemId }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove the hazard");
      }
    });
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <ShieldAlert className="h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-600">No hazard analysis yet</p>
        <p className="mt-1 text-xs text-slate-400">
          A hazard analysis is required for each FSVP record under § 1.504.
        </p>
        {!readonly && (
          <>
            <button
              onClick={createAnalysis}
              disabled={creating}
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-[#195f4d] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {creating ? "Creating…" : "Start Hazard Analysis"}
            </button>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </>
        )}
      </div>
    );
  }

  const statusTone = analysis.status === "final" ? "success" : analysis.status === "superseded" ? "neutral" : "warning";
  const byType = analysis.items.reduce<Record<string, HazardItem[]>>((acc, item) => {
    (acc[item.hazard_type] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div>
      {/* Analysis header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-ink">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div>
            <span className="text-sm font-semibold text-ink">Version {analysis.version}</span>
            {analysis.performed_by_name && (
              <span className="ml-2 text-xs text-slate-400">by {analysis.performed_by_name}</span>
            )}
            {analysis.performed_at && (
              <span className="ml-2 text-xs text-slate-400">
                · {new Date(analysis.performed_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <StatusBadge tone={statusTone}>
            {analysis.status.charAt(0).toUpperCase() + analysis.status.slice(1)}
          </StatusBadge>
          {analysis.next_reassessment_due_at && (
            <span className={`text-xs ${new Date(analysis.next_reassessment_due_at) <= new Date() ? "text-red-600 font-semibold" : "text-slate-400"}`}>
              Reassessment: {new Date(analysis.next_reassessment_due_at).toLocaleDateString()}
            </span>
          )}
          {/* So a closed analysis still says what is inside it. */}
          {!expanded && (
            <span className="text-xs text-slate-400">
              {analysis.items.length} hazard{analysis.items.length === 1 ? "" : "s"} identified
            </span>
          )}
        </div>
        {!readonly && analysis.status !== "superseded" && (
          <div className="flex shrink-0 items-center gap-2">
            {analysis.status === "draft" ? (
              <>
                <button
                  onClick={() => { setExpanded(true); setShowAddItem(true); }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Hazard
                </button>
                {/* Disabled rather than hidden when there are no hazards: an
                    empty § 1.504 analysis is the case the API refuses, and a
                    button that vanishes teaches nothing about why. */}
                <button
                  onClick={() => setFinality("finalize")}
                  disabled={pendingFinality || analysis.items.length === 0}
                  title={
                    analysis.items.length === 0
                      ? "Add at least one known or reasonably foreseeable hazard first."
                      : undefined
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-forest px-3 text-xs font-semibold text-white hover:bg-[#195f4d] disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {pendingFinality ? "Saving…" : "Mark Final"}
                </button>
              </>
            ) : (
              <button
                onClick={() => { setExpanded(true); setFinality("reopen"); }}
                disabled={pendingFinality}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Undo2 className="h-3.5 w-3.5" />
                {pendingFinality ? "Reopening…" : "Reopen"}
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Methodology note */}
          {analysis.methodology_notes && (
            <p className="text-sm text-slate-600 bg-slate-50 rounded-md px-3 py-2">
              {analysis.methodology_notes}
            </p>
          )}

          {analysis.relied_on_other_party && analysis.relied_on_party_name && (
            <p className="text-xs text-slate-500 italic">
              Relying on hazard analysis performed by {analysis.relied_on_party_name}
            </p>
          )}

          {/* Hazard items by type */}
          {analysis.items.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No hazards identified yet. Add at least one hazard.</p>
          ) : (
            ["biological", "chemical", "physical", "radiological"].map((type) => {
              const items = byType[type];
              if (!items?.length) return null;
              return (
                <div key={type}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {type}
                  </p>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-start gap-3 rounded-md border px-3 py-2 text-sm ${HAZARD_TYPE_COLORS[type]}`}
                      >
                        <div className="flex-1">
                          <span className="font-semibold">{item.hazard_name}</span>
                          {item.is_sahcodha && (
                            <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">SAHCODHA</span>
                          )}
                          {item.controlling_entity && (
                            <span className="ml-2 text-xs opacity-70">
                              Controlled by: {item.controlling_entity.replace(/_/g, " ")}
                            </span>
                          )}
                          {item.controls_description && (
                            <p className="mt-0.5 text-xs opacity-70">{item.controls_description}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {item.requires_control && (
                            <StatusBadge tone="danger">Requires Control</StatusBadge>
                          )}
                          {item.severity && (
                            <StatusBadge tone={severityTone(item.severity)}>
                              {item.severity.charAt(0).toUpperCase() + item.severity.slice(1)}
                            </StatusBadge>
                          )}
                        </div>
                        {/* Draft only. A final analysis is what the checklist
                            and the approval gate read, so it is reopened
                            first rather than changed underneath them. */}
                        {!readonly && analysis.status === "draft" && (
                          <button
                            onClick={() => removeItem(item.id)}
                            disabled={pendingFinality}
                            aria-label={`Remove ${item.hazard_name}`}
                            title="Remove this hazard"
                            className="shrink-0 rounded p-1 opacity-50 transition hover:bg-white/60 hover:opacity-100 disabled:opacity-25"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {showAddItem && (
            <AddHazardItemForm
              analysisId={analysis.id}
              onDone={() => setShowAddItem(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
