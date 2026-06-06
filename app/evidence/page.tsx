import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { EvidenceUploadPanel } from "@/components/evidence/EvidenceUploadPanel";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { FileArchive } from "lucide-react";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function approvalTone(status: string | null): StatusTone {
  if (status === "accepted" || status === "complete") return "success";
  if (status === "under_review") return "info";
  if (status === "revision_required" || status === "rejected") return "danger";
  if (status === "uploaded") return "warning";
  return "neutral";
}

function approvalLabel(status: string | null) {
  if (!status) return "Uploaded";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function EvidencePage() {
  const { role } = await requireProfileRole("/evidence");
  const supabase = createServerSupabaseClient();

  type DocRow = { id: string; title: string; document_kind: string; original_filename: string | null; uploaded_at: string; approval_status: string | null; size_bytes: number };

  const [docsRes, reqsRes] = await Promise.all([
    supabase.from("documents").select("id, title, document_kind, original_filename, uploaded_at, approval_status, size_bytes").order("uploaded_at", { ascending: false }),
    supabase.from("fsvp_requirements").select("id, requirement_name, requirement_key, sort_order").eq("active", true).order("sort_order"),
  ]);

  const documents = (docsRes.data ?? []) as unknown as DocRow[];
  const requirements = reqsRes.data;

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Evidence"
        description="Upload and manage FSVP evidence documents, track review status, and map each document to its regulatory requirement."
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <EvidenceUploadPanel />

          {!documents || documents.length === 0 ? (
            <EmptyState
              icon={FileArchive}
              title="No documents uploaded"
              description="Upload your first FSVP evidence document — COAs, audit reports, supplier questionnaires, hazard analyses, and more."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
              <div className="border-b border-line bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-700">Uploaded Documents</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-slate-50/50">
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Document</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Category</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Uploaded</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{doc.title}</p>
                        {doc.original_filename && <p className="text-xs text-slate-400">{doc.original_filename}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 capitalize">{doc.document_kind.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(doc.uploaded_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={approvalTone(doc.approval_status)}>
                          {approvalLabel(doc.approval_status)}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <h3 className="text-sm font-semibold text-ink">FSVP Requirements</h3>
            <p className="mt-1 text-xs text-slate-500">Evidence needed per 21 CFR Part 1, Subpart L</p>
            <div className="mt-4 space-y-2">
              {(requirements ?? []).map((req) => (
                <div key={req.id} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                  <span className="text-xs font-medium text-slate-700">{req.requirement_name}</span>
                </div>
              ))}
              {(!requirements || requirements.length === 0) && (
                <p className="text-xs text-slate-400">Requirements not loaded.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
