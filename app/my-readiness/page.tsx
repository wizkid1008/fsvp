import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

type ReqRow = { id: string; requirement_name: string; requirement_description: string; required_evidence: string; sort_order: number };
type DocRow = { id: string; document_kind: string; approval_status: string | null };

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
  const { role } = await requireProfileRole("/my-readiness", ["supplier"]);
  const supabase = createServerSupabaseClient();

  const [reqsRes, docsRes] = await Promise.all([
    (supabase.from("fsvp_requirements") as any)
      .select("id, requirement_name, requirement_description, required_evidence, sort_order")
      .eq("active", true)
      .order("sort_order"),
    (supabase.from("documents") as any)
      .select("id, document_kind, approval_status")
      .is("soft_deleted_at", null),
  ]);

  const requirements = (reqsRes.data ?? []) as ReqRow[];
  const documents = (docsRes.data ?? []) as DocRow[];

  // Map document_kind to requirement_key by convention
  const docKindSet = new Set(documents.map((d: DocRow) => d.document_kind.toLowerCase().replace(/\s+/g, "_")));
  const acceptedKinds = new Set(
    documents
      .filter((d: DocRow) => d.approval_status === "accepted" || d.approval_status === "complete")
      .map((d: DocRow) => d.document_kind.toLowerCase().replace(/\s+/g, "_"))
  );
  const uploadedKinds = new Set(
    documents.map((d: DocRow) => d.document_kind.toLowerCase().replace(/\s+/g, "_"))
  );

  // Score: accepted reqs / total reqs
  const accepted = requirements.filter((r) => acceptedKinds.has(r.id) || acceptedKinds.has(r.requirement_name.toLowerCase().replace(/\s+/g, "_"))).length;
  const uploaded = requirements.filter((r) => uploadedKinds.has(r.id) || uploadedKinds.has(r.requirement_name.toLowerCase().replace(/\s+/g, "_")) || documents.length > 0).length;
  const totalDocs = documents.length;
  const acceptedDocs = documents.filter((d: DocRow) => d.approval_status === "accepted" || d.approval_status === "complete").length;
  const pendingDocs = documents.filter((d: DocRow) => d.approval_status === "uploaded" || d.approval_status === "under_review").length;
  const revisionDocs = documents.filter((d: DocRow) => d.approval_status === "revision_required" || d.approval_status === "rejected").length;

  const scoreRaw = totalDocs === 0 ? 0 : Math.round((acceptedDocs / Math.max(requirements.length, 1)) * 100);
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
              const hasDoc = totalDocs > 0;
              const docForReq = documents.find((d: DocRow) =>
                d.document_kind.toLowerCase().includes(req.requirement_name.toLowerCase().split(" ")[0])
              );
              const status = docForReq?.approval_status ?? (hasDoc ? "uploaded" : null);

              return (
                <div key={req.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                  <StatusIcon status={docForReq ? status : null} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink">{req.requirement_name}</p>
                    <p className="mt-0.5 text-xs text-slate-500 leading-5">{req.requirement_description}</p>
                    <p className="mt-1.5 text-xs text-slate-400">
                      <span className="font-medium text-slate-500">Required: </span>{req.required_evidence}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {docForReq ? (
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
