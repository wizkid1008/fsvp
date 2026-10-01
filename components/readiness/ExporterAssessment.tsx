"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StartAssessmentModal } from "./StartAssessmentModal";
import type { StatusTone } from "@/types/platform";

/**
 * An exporter's readiness assessments, on that exporter's own page.
 *
 * This was the Readiness page under Monitoring: pick an exporter from a
 * dropdown, then see its assessment and three requirement lists. The lists
 * repeated what the exporter, facility and product pages already show with
 * their checklists, so only the assessment itself — the part nothing else
 * holds — moved here, and /readiness redirects to /exporters.
 *
 * Labelled "Readiness assessment score" rather than "readiness score": it is
 * the score recorded when someone ran an assessment, not a live measure, and
 * there are other scores in the app it must not be confused with.
 */

export type AssessmentRow = {
  id: string;
  overall_score: number;
  status: string;
  gap_summary: string | null;
  recommended_actions: string | null;
  submitted_at: string | null;
  created_at: string;
};

function scoreTone(score: number): StatusTone {
  if (score >= 85) return "success";
  if (score >= 65) return "warning";
  return "danger";
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ExporterAssessment({
  supplier,
  assessments,
  canAssess,
}: {
  supplier: { id: string; company_name: string; country: string };
  /** This exporter's assessments, newest first. */
  assessments: AssessmentRow[];
  canAssess: boolean;
}) {
  const [showModal, setShowModal] = useState(false);
  const latest = assessments[0] ?? null;
  const score = latest ? Number(latest.overall_score) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm leading-6 text-slate-600">
          A scored review of this exporter&apos;s FSVP readiness, recorded when someone runs an
          assessment. It does not update on its own — the requirement list above is the live view.
        </p>
        {canAssess && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-forest px-3 text-sm font-semibold text-white transition hover:bg-[#195f4d]"
          >
            <Plus className="h-4 w-4" />
            Start assessment
          </button>
        )}
      </div>

      {!latest ? (
        <p className="mt-4 rounded-md border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No assessment has been run for {supplier.company_name} yet.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Readiness assessment score
            </span>
            <StatusBadge tone={scoreTone(score)}>{Math.round(score)}%</StatusBadge>
            <StatusBadge tone="neutral">{statusLabel(latest.status)}</StatusBadge>
            <span className="text-xs text-slate-500">
              Assessed {new Date(latest.created_at).toLocaleDateString()}
              {latest.submitted_at && ` · submitted ${new Date(latest.submitted_at).toLocaleDateString()}`}
            </span>
          </div>

          {latest.gap_summary && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Gap summary</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{latest.gap_summary}</p>
            </div>
          )}
          {latest.recommended_actions && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recommended actions</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">{latest.recommended_actions}</p>
            </div>
          )}

          {assessments.length > 1 && (
            <details className="rounded-md border border-line">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-slate-700">
                Earlier assessments ({assessments.length - 1})
              </summary>
              <table className="w-full border-t border-line text-sm">
                <tbody className="divide-y divide-line">
                  {assessments.slice(1).map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-2.5 text-slate-600">{new Date(a.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={scoreTone(Number(a.overall_score))}>
                          {Math.round(Number(a.overall_score))}%
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{statusLabel(a.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}

      {showModal && (
        <StartAssessmentModal
          suppliers={[supplier]}
          defaultSupplierId={supplier.id}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
