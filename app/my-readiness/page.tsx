import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

type ReqRow = { id: string; requirement_name: string; requirement_description: string; required_evidence: string; sort_order: number };
type DocRow = { id: string; title: string; document_kind: string; approval_status: string | null; related_requirement_id: string | null };
type RequirementEvidenceRow = { id: string; requirement_id: string; document_id: string | null; status: string | null; gap_status: string | null };

function evidenceStatusTone(status: string | null): StatusTone {
  if (status === "accepted" || status === "complete") return "success";
  if (status === "under_review") return "info";
  if (status === "revision_required" || status === "rejected") return "danger";
  if (status === "uploaded") return "warning";
  return "neutral";
}

function evidenceStatusLabel(status: string | null) {
  if (!status) return "Not submitted";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusIcon({ status }: { status: string | null }) {
  if (status === "accepted" || status === "complete") return <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />;
  if (status === "under_review" || status === "uploaded") return <Clock className="h-5 w-5 text-amber-400 shrink-0" />;
  if (status === "revision_required" || status === "rejected") return <XCircle className="h-5 w-5 text-red-500 shrink-0" />;
  return <AlertCircle className="h-5 w-5 text-slate-300 shrink-0" />;
}

export default async function MyReadinessPage() {
  const { role } = await requireProfileRole("/my-readiness", ["supplier", "administrator"]);
  const supabase = createServerSupabaseClient();

  const [reqsRes, docsRes, evidenceRes] = await Promise.all([
    (supabase.from("fsvp_requirements") as any)
      .select("id, requirement_name, requirement_description, required_evidence, sort_order")
      .eq("active", true)
      .order("sort_order"),
    (supabase.from("documents") as any)
      .select("id, title, document_kind, approval_status, related_requirement_id")
      .is("soft_deleted_at", null),
    (supabase.from("requirement_evidence") as any)
      .select("id, requirement_id, document_id, status, gap_status"),
  ]);

  const requirements = (reqsRes.data ?? []) as ReqRow[];
  const documents = (docsRes.data ?? []) as DocRow[];
  const requirementEvidence = (evidenceRes.data ?? []) as RequirementEvidenceRow[];
  const documentsByRequirement = new Map<string, DocRow[]>();
  const evidenceByRequirement = new Map<string, RequirementEvidenceRow[]>();

  documents.forEach((document) => {
    if (!document.related_requirement_id) return;
    const existing = documentsByRequirement.get(document.related_requirement_id) ?? [];
    existing.push(document);
    documentsByRequirement.set(document.related_requirement_id, existing);
  });

  requirementEvidence.forEach((evidence) => {
    const existing = evidenceByRequirement.get(evidence.requirement_id) ?? [];
    existing.push(evidence);
    evidenceByRequirement.set(evidence.requirement_id, existing);
  });

  const totalDocs = documents.length;
  const acceptedDocs = documents.filter((d: DocRow) => d.approval_status === "accepted" || d.approval_status === "complete").length;
  const pendingDocs = documents.filter((d: DocRow) => d.approval_status === "uploaded" || d.approval_status === "under_review").length;
  const revisionDocs = documents.filter((d: DocRow) => d.approval_status === "revision_required" || d.approval_status === "rejected").length;

  function statusForRequirement(requirementId: string) {
    const linkedDocuments = documentsByRequirement.get(requirementId) ?? [];
    const linkedEvidence = evidenceByRequirement.get(requirementId) ?? [];
    const statuses = [
      ...linkedDocuments.map((document) => document.approval_status),
      ...linkedEvidence.map((evidence) => evidence.status)
    ].filter(Boolean) as string[];

    if (statuses.some((status) => status === "accepted" || status === "complete")) return "accepted";
    if (statuses.some((status) => status === "revision_required" || status === "rejected")) return "revision_required";
    if (statuses.some((status) => status === "under_review")) return "under_review";
    if (statuses.some((status) => status === "uploaded")) return "uploaded";
    if (linkedEvidence.some((evidence) => evidence.gap_status)) return "missing";
    return null;
  }

  const acceptedRequirements = requirements.filter((requirement) => {
    const status = statusForRequirement(requirement.id);
    return status === "accepted" || status === "complete";
  }).length;

  const scoreRaw = requirements.length === 0 ? 0 : Math.round((acceptedRequirements / requirements.length) * 100);
  const score = Math.min(scoreRaw, 100);

  const ringColor = score >= 75 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
  const circ = 2 * Math.PI * 54;
  const offset = circ - (score / 100) * circ;

  return (
    <AppShell role={role}>
      <SectionHeader
        title="My Readiness"
        description="See how your submitted evidence tracks against FSVP requirements. Upload missing documents to improve your readiness score."
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[200px_1fr]">
        {/* Score ring */}
        <div className="flex flex-col items-center justify-start gap-4">
          <div className="rounded-lg border border-line bg-white p-5 shadow-soft flex flex-col items-center w-full">
            <svg viewBox="0 0 120 120" className="h-32 w-32">
              <circle cx="60" cy="60" r="54" fill="none" stroke="#f1f5f9" strokeWidth="10" />
              <circle cx="60" cy="60" r="54" fill="none" stroke={ringColor} strokeWidth="10"
                strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                transform="rotate(-90 60 60)" />
              <text x="60" y="58" textAnchor="middle" dominantBaseline="middle" fontSize="22" fontWeight="700" fill="#0f172a">{score}</text>
              <text x="60" y="74" textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#94a3b8">/ 100</text>
            </svg>
            <p className="mt-2 text-sm font-semibold text-slate-600">Readiness Score</p>
          </div>

          <div className="rounded-lg border border-line bg-white p-4 shadow-soft w-full space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Documents submitted</span>
              <span className="font-semibold text-ink">{totalDocs}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Accepted</span>
              <span className="font-semibold text-emerald-600">{acceptedDocs}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Under review</span>
              <span className="font-semibold text-amber-600">{pendingDocs}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Needs revision</span>
              <span className="font-semibold text-red-600">{revisionDocs}</span>
            </div>
          </div>
        </div>

        {/* Requirements checklist */}
        <div className="rounded-lg border border-line bg-white shadow-soft overflow-hidden">
          <div className="border-b border-line bg-slate-50 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-700">FSVP Requirements Checklist</h3>
            <p className="text-xs text-slate-500 mt-0.5">Each requirement needs at least one accepted document</p>
          </div>
          <div className="divide-y divide-line">
            {requirements.map((req) => {
              const linkedDocuments = documentsByRequirement.get(req.id) ?? [];
              const status = statusForRequirement(req.id);
              const docForReq = linkedDocuments[0] ?? null;

              return (
                <div key={req.id} className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-slate-50">
                  <StatusIcon status={status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink">{req.requirement_name}</p>
                    <p className="mt-0.5 text-xs text-slate-500 leading-5">{req.requirement_description}</p>
                    <p className="mt-1.5 text-xs text-slate-400">
                      <span className="font-medium text-slate-500">Required: </span>{req.required_evidence}
                    </p>
                    {docForReq ? (
                      <p className="mt-1.5 text-xs text-slate-500">
                        <span className="font-medium">Mapped document: </span>{docForReq.title}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0">
                    {status ? (
                      <StatusBadge tone={evidenceStatusTone(status)}>{evidenceStatusLabel(status)}</StatusBadge>
                    ) : (
                      <a href="/my-evidence" className="inline-flex h-7 items-center rounded-md border border-forest px-2.5 text-xs font-semibold text-forest hover:bg-emerald-50 transition">
                        Upload
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
            {requirements.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-slate-400">Requirements could not be loaded.</div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
