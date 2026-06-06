import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Gauge } from "lucide-react";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function readinessTone(score: number): StatusTone {
  if (score >= 85) return "success";
  if (score >= 65) return "warning";
  return "danger";
}

function readinessLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// SVG circle ring for score display
function ScoreRing({ score, tone }: { score: number; tone: StatusTone }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = tone === "success" ? "#22c55e" : tone === "warning" ? "#f59e0b" : "#ef4444";

  return (
    <svg viewBox="0 0 120 120" className="h-32 w-32">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
      <circle
        cx="60" cy="60" r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="60" textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="700" fill="#0f172a">
        {Math.round(score)}
      </text>
      <text x="60" y="76" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#94a3b8">
        / 100
      </text>
    </svg>
  );
}

export default async function ReadinessPage() {
  const { role } = await requireProfileRole("/readiness");
  const supabase = createServerSupabaseClient();

  type AssessmentRow = { id: string; overall_score: number; status: string; gap_summary: string | null; recommended_actions: string | null; submitted_at: string | null; created_at: string; supplier_id: string; foreign_suppliers: { supplier_name: string } | null };

  const { data: rawAssessments } = await supabase
    .from("readiness_assessments")
    .select("id, overall_score, status, gap_summary, recommended_actions, submitted_at, created_at, supplier_id")
    .order("created_at", { ascending: false });

  const assessments = (rawAssessments ?? []) as unknown as AssessmentRow[];

  const latest = assessments?.[0] ?? null;
  const score = latest ? Number(latest.overall_score) : 0;
  const tone = readinessTone(score);
  const supplier = latest?.foreign_suppliers as { supplier_name: string } | null;

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Readiness"
        description="Review your overall FSVP readiness score, identify critical gaps, and generate audit-ready reports."
      />

      {!assessments || assessments.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="No readiness assessment yet"
          description="Start a readiness assessment to calculate your FSVP compliance score, surface critical gaps, and generate reports."
          action={{ label: "Start assessment", href: "#" }}
        />
      ) : (
        <div className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center justify-center rounded-lg border border-line bg-white p-6 shadow-soft">
              <ScoreRing score={score} tone={tone} />
              <p className="mt-3 text-sm font-semibold text-slate-600">Overall Readiness</p>
              <StatusBadge tone={tone} className="mt-2">{readinessLabel(latest?.status ?? "draft")}</StatusBadge>
              {supplier && <p className="mt-2 text-xs text-slate-400">{supplier.supplier_name}</p>}
            </div>

            <div className="rounded-lg border border-line bg-white p-5 shadow-soft space-y-4">
              <h3 className="text-sm font-semibold text-ink">Assessment Summary</h3>
              {latest?.gap_summary && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gap Summary</p>
                  <p className="mt-1 text-sm text-slate-700">{latest.gap_summary}</p>
                </div>
              )}
              {latest?.recommended_actions && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recommended Actions</p>
                  <p className="mt-1 text-sm text-slate-700">{latest.recommended_actions}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-4 pt-2 border-t border-line">
                <div>
                  <p className="text-xs text-slate-400">Created</p>
                  <p className="text-sm font-medium">{new Date(latest?.created_at ?? "").toLocaleDateString()}</p>
                </div>
                {latest?.submitted_at && (
                  <div>
                    <p className="text-xs text-slate-400">Submitted</p>
                    <p className="text-sm font-medium">{new Date(latest.submitted_at).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {assessments.length > 1 && (
            <div className="rounded-lg border border-line bg-white shadow-soft overflow-hidden">
              <div className="border-b border-line bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-700">Assessment History</h3>
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
                  {assessments.map((a) => (
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
    </AppShell>
  );
}
