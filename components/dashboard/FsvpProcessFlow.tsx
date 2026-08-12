import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import type { FsvpRecordStatus } from "@/types/database";

export type FsvpProcessRecord = {
  id: string;
  status: FsvpRecordStatus;
  reassessment_due_at: string | null;
  facility_name: string | null;
  product_name: string | null;
};

/**
 * Stage names track the canonical setup path in lib/setup/fsvp-steps.ts, so a
 * record's position here means the same thing it means on /setup/fsvp.
 *
 * "Approved & Monitoring" previously also contained `rejected` and `expired`.
 * A rejected record therefore sat in the column headed Approved — tinted red,
 * but filed under the opposite of what had happened to it. Blocked states now
 * have their own column, and it is first, because it is the one that needs
 * someone to act.
 */
const STAGES = [
  { key: "blocked", label: "Blocked", statuses: ["needs_corrective_action", "rejected", "expired"] },
  { key: "evidence", label: "Evidence Collection", statuses: ["draft", "awaiting_supplier_evidence"] },
  { key: "submitted", label: "Submitted for Review", statuses: ["supplier_evidence_submitted", "supplier_evidence_accepted"] },
  { key: "review", label: "Importer Review", statuses: ["importer_review_pending"] },
  { key: "decision", label: "Approved & Monitoring", statuses: ["importer_approved", "conditionally_approved", "reassessment_due"] },
] as const;

/** Unrecognised statuses fall into Evidence Collection, not into Blocked. */
const DEFAULT_STAGE_INDEX = STAGES.findIndex((s) => s.key === "evidence");
const BLOCKED_STAGE_INDEX = STAGES.findIndex((s) => s.key === "blocked");

function stageIndexFor(status: FsvpRecordStatus): number {
  const idx = STAGES.findIndex((s) => (s.statuses as readonly string[]).includes(status));
  return idx === -1 ? DEFAULT_STAGE_INDEX : idx;
}

type CardTone = "neutral" | "info" | "warning" | "success" | "danger";

const cardClasses: Record<CardTone, string> = {
  neutral: "bg-slate-50 text-ink",
  info: "bg-sky-50 text-sky-800",
  warning: "bg-amber-50 text-amber-800",
  success: "bg-emerald-50 text-emerald-800",
  danger: "bg-red-50 text-red-700",
};

const subtitleClasses: Record<CardTone, string> = {
  neutral: "text-slate-500",
  info: "text-sky-600",
  warning: "text-amber-700",
  success: "text-emerald-600",
  danger: "text-red-600",
};

function cardTone(status: FsvpRecordStatus): CardTone {
  if (status === "needs_corrective_action" || status === "rejected") return "danger";
  if (status === "reassessment_due" || status === "expired") return "warning";
  if (status === "importer_approved" || status === "conditionally_approved") return "success";
  if (status === "importer_review_pending") return "info";
  if (status === "supplier_evidence_submitted" || status === "supplier_evidence_accepted") return "warning";
  return "neutral";
}

function cardSubtitle(record: FsvpProcessRecord): string {
  if (record.status === "needs_corrective_action") return "Corrective action needed";
  if (record.status === "rejected") return "Rejected — cannot be imported";
  if (record.status === "reassessment_due" || record.status === "expired") {
    return record.reassessment_due_at
      ? `Reassessment due ${new Date(record.reassessment_due_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`
      : "Reassessment due";
  }
  return record.product_name ?? "Product";
}

export function FsvpProcessFlow({ records }: { records: FsvpProcessRecord[] }) {
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

  const byStage = STAGES.map((stage, i) => records.filter((r) => stageIndexFor(r.status) === i));
  const blockedCount = byStage[BLOCKED_STAGE_INDEX].length;

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">FSVP Process</h2>
        <div className="flex items-center gap-3">
          {blockedCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {blockedCount} need{blockedCount === 1 ? "s" : ""} attention
            </span>
          )}
          <span className="text-xs text-slate-400">
            {records.length} facility &amp; product record{records.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STAGES.map((stage, i) => {
          const items = byStage[i];
          return (
            <div key={stage.key}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">{stage.label}</span>
                <span className="text-xs text-slate-400">{items.length}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {items.length === 0 ? (
                  <div className="rounded-md border border-dashed border-line px-2.5 py-3 text-center text-xs text-slate-300">
                    None
                  </div>
                ) : (
                  items.map((r) => {
                    const tone = cardTone(r.status);
                    return (
                      <div key={r.id} className={`rounded-md px-2.5 py-2 ${cardClasses[tone]}`}>
                        <p className="truncate text-xs font-semibold">{r.facility_name ?? "Facility"}</p>
                        <p className={`truncate text-[11px] ${subtitleClasses[tone]}`}>{cardSubtitle(r)}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <span className="text-xs text-slate-400">New facilities and products enter at Evidence Collection.</span>
        <Link
          href="/facilities"
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-forest hover:text-forest transition"
        >
          <Plus className="h-3.5 w-3.5" />
          Add facility or product
        </Link>
      </div>
    </section>
  );
}
