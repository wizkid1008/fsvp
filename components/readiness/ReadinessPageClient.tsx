"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Gauge, Plus } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { StartAssessmentModal } from "./StartAssessmentModal";
import type { StatusTone } from "@/types/platform";

type AssessmentRow = {
  id: string;
  overall_score: number;
  status: string;
  gap_summary: string | null;
  recommended_actions: string | null;
  submitted_at: string | null;
  created_at: string;
  supplier_id: string;
  supplier_name: string;
};

type SupplierOption = { id: string; company_name: string; country: string };

function readinessTone(score: number): StatusTone {
  if (score >= 85) return "success";
  if (score >= 65) return "warning";
  return "danger";
}

function readinessLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ScoreRing({ score, tone }: { score: number; tone: StatusTone }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = tone === "success" ? "#22c55e" : tone === "warning" ? "#f59e0b" : "#ef4444";
  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 60 60)" />
      <text x="60" y="60" textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="700" fill="#0f172a">
        {Math.round(score)}
      </text>
      <text x="60" y="76" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#94a3b8">
        / 100
      </text>
    </svg>
  );
}

interface Props {
  assessments: AssessmentRow[];
  suppliers: SupplierOption[];
  selectedSupplierId: string | null;
  canAssess: boolean;
}

export function ReadinessPageClient({ assessments, suppliers, selectedSupplierId, canAssess }: Props) {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Scores belong to a supplier. Showing the most recent row from any supplier
  // as one "overall" figure was the previous behaviour and it was misleading.
  const forSupplier = assessments.filter((a) => a.supplier_id === selectedSupplierId);
  const latest = forSupplier[0] ?? null;
  const score = latest ? Number(latest.overall_score) : 0;
  const tone = readinessTone(score);
  const selected = suppliers.find((s) => s.id === selectedSupplierId) ?? null;

  function selectSupplier(id: string) {
    router.push(`${pathname}?supplier=${encodeURIComponent(id)}`);
  }

  if (suppliers.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={Gauge}
          title="No exporters linked yet"
          description="Readiness is assessed per exporter. Link or add one first, then run an assessment against them."
          action={{ label: "Go to Exporters", href: "/suppliers" }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          Exporter
          <select
            value={selectedSupplierId ?? ""}
            onChange={(e) => selectSupplier(e.target.value)}
            className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.company_name} — {s.country}</option>
            ))}
          </select>
        </label>

        {canAssess && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-forest px-3 py-2 text-sm font-semibold text-white hover:bg-forest/90"
          >
            <Plus className="h-4 w-4" />
            Start Assessment
          </button>
        )}
      </div>

      {!latest ? (
        <div className="mt-6">
          <EmptyState
            icon={Gauge}
            title={`No assessment yet for ${selected?.company_name ?? "this exporter"}`}
            description="Run a readiness assessment to score their FSVP records, surface critical gaps, and generate reports. The section breakdown below already reflects the evidence on file."
            action={canAssess ? { label: "Start Assessment", href: "#" } : undefined}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center justify-center rounded-lg border border-line bg-white p-6 shadow-soft">
              <ScoreRing score={score} tone={tone} />
              <p className="mt-3 text-sm font-semibold text-slate-600">{selected?.company_name}</p>
              <StatusBadge tone={tone} className="mt-2">{readinessLabel(latest.status)}</StatusBadge>
            </div>

            <div className="rounded-lg border border-line bg-white p-5 shadow-soft space-y-4">
              <h3 className="text-sm font-semibold text-ink">Assessment Summary</h3>
              {latest.gap_summary && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gap Summary</p>
                  <p className="mt-1 text-sm text-slate-700">{latest.gap_summary}</p>
                </div>
              )}
              {latest.recommended_actions && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recommended Actions</p>
                  <p className="mt-1 text-sm text-slate-700">{latest.recommended_actions}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-4 pt-2 border-t border-line">
                <div>
                  <p className="text-xs text-slate-400">Assessed</p>
                  <p className="text-sm font-medium">{new Date(latest.created_at).toLocaleDateString()}</p>
                </div>
                {latest.submitted_at && (
                  <div>
                    <p className="text-xs text-slate-400">Submitted</p>
                    <p className="text-sm font-medium">{new Date(latest.submitted_at).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {forSupplier.length > 1 && (
            <div className="rounded-lg border border-line bg-white shadow-soft overflow-hidden">
              <div className="border-b border-line bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-700">
                  History — {selected?.company_name}
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Date</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Score</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {forSupplier.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">{new Date(a.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 font-semibold text-ink">{Math.round(Number(a.overall_score))}%</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={readinessTone(Number(a.overall_score))}>{readinessLabel(a.status)}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {assessments.length > forSupplier.length && (
        <div className="mt-6 rounded-lg border border-line bg-white shadow-soft overflow-hidden">
          <div className="border-b border-line bg-slate-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-700">All exporters</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Exporter</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Latest Score</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Assessed</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {suppliers.map((s) => {
                const a = assessments.find((x) => x.supplier_id === s.id);
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-ink">{s.company_name}</td>
                    <td className="px-4 py-3">
                      {a ? (
                        <StatusBadge tone={readinessTone(Number(a.overall_score))}>
                          {Math.round(Number(a.overall_score))}%
                        </StatusBadge>
                      ) : (
                        <span className="text-xs text-slate-400">Not assessed</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {a ? new Date(a.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => selectSupplier(s.id)}
                        className="text-xs font-semibold text-forest hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <StartAssessmentModal onClose={() => setShowModal(false)} />}
    </>
  );
}
