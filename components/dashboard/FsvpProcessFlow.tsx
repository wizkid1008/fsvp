import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import type { FsvpRecordStatus } from "@/types/database";

const STAGES = [
  { key: "evidence", label: "Evidence Collection", statuses: ["draft", "awaiting_supplier_evidence"] },
  { key: "submitted", label: "Submitted for Review", statuses: ["supplier_evidence_submitted", "supplier_evidence_accepted"] },
  { key: "review", label: "Importer Review", statuses: ["importer_review_pending", "needs_corrective_action"] },
  { key: "decision", label: "Approved & Monitoring", statuses: ["importer_approved", "conditionally_approved", "rejected", "reassessment_due", "expired"] },
] as const;

function stageIndexFor(status: FsvpRecordStatus): number {
  const idx = STAGES.findIndex((s) => (s.statuses as readonly string[]).includes(status));
  return idx === -1 ? 0 : idx;
}

type StepTone = "done" | "current-ok" | "current-blocked" | "current-success" | "upcoming";

const nodeClasses: Record<StepTone, string> = {
  done: "border-emerald-500 bg-emerald-500 text-white",
  "current-ok": "border-forest bg-forest text-white",
  "current-blocked": "border-red-400 bg-red-50 text-red-600",
  "current-success": "border-emerald-500 bg-emerald-500 text-white",
  upcoming: "border-line bg-white text-slate-300",
};

export function FsvpProcessFlow({ records }: { records: Array<{ status: FsvpRecordStatus }> }) {
  if (records.length === 0) {
    return (
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <h2 className="mb-1 text-sm font-semibold text-ink">FSVP Process</h2>
        <p className="text-sm text-slate-500">
          Your compliance record hasn't started yet — add a facility and product, then upload evidence to begin.
        </p>
      </section>
    );
  }

  const stageIndices = records.map((r) => stageIndexFor(r.status));
  const currentStage = Math.min(...stageIndices);
  const blockedCount = records.filter((r) => r.status === "needs_corrective_action" || r.status === "rejected").length;
  const approvedCount = records.filter((r) => r.status === "importer_approved" || r.status === "conditionally_approved").length;
  const monitoringCount = records.filter((r) => r.status === "reassessment_due" || r.status === "expired").length;

  function toneFor(i: number): StepTone {
    if (i < currentStage) return "done";
    if (i > currentStage) return "upcoming";
    if (blockedCount > 0) return "current-blocked";
    if (i === STAGES.length - 1 && approvedCount > 0) return "current-success";
    return "current-ok";
  }

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">FSVP Process</h2>
        {blockedCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            {blockedCount} record{blockedCount > 1 ? "s" : ""} need{blockedCount === 1 ? "s" : ""} attention
          </span>
        )}
      </div>

      <div className="flex items-start">
        {STAGES.map((stage, i) => {
          const tone = toneFor(i);
          const isFinal = i === STAGES.length - 1;
          return (
            <div key={stage.key} className="flex flex-1 items-start last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${nodeClasses[tone]}`}>
                  {tone === "done" || tone === "current-success" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Circle className="h-3 w-3 fill-current" />
                  )}
                </div>
                <span
                  className={`w-[92px] text-center text-xs font-medium ${tone === "upcoming" ? "text-slate-400" : "text-ink"}`}
                >
                  {stage.label}
                </span>
              </div>
              {!isFinal && (
                <div className={`mx-2 mt-4 h-0.5 flex-1 ${i < currentStage ? "bg-emerald-500" : "bg-line"}`} />
              )}
            </div>
          );
        })}
      </div>

      {monitoringCount > 0 && (
        <p className="mt-4 text-xs text-amber-700">
          {monitoringCount} approved record{monitoringCount > 1 ? "s" : ""} due for reassessment.
        </p>
      )}
    </section>
  );
}
