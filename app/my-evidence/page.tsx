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

function statusTone(status: string | null): StatusTone {
  if (status === "accepted" || status === "complete") return "success";
  if (status === "under_review") return "info";
  if (status === "revision_required" || status === "rejected") return "danger";
  if (status === "uploaded") return "warning";
  return "neutral";
}

function statusLabel(status: string | null) {
  if (!status) return "Uploaded";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function MyEvidencePage() {
  const { role } = await requireProfileRole("/my-evidence", ["supplier"]);
  const supabase = createServerSupabaseClient();

  type DocRow = { id: string; title: string; document_kind: string; original_filename: string | null; uploaded_at: string; approval_status: string | null; review_notes: string | null };

  const { data: rawDocs } = await (supabase.from("documents") as any)
    .select("id, title, document_kind, original_filename, uploaded_at, approval_status, review_notes")
    .order("uploaded_at", { ascending: false });

  const documents = (rawDocs ?? []) as DocRow[];

  return (
    <AppShell role={role}>
      <SectionHeader
        title="My Evidence"
        description="Upload and track your FSVP evidence submissions. You can see the review status and any notes from the reviewer here."
      />

      <div className="mt-6 space-y-6">
        <EvidenceUploadPanel />

        {documents.length === 0 ? (
          <EmptyState
            icon={FileArchive}
            title="No documents uploaded yet"
            description="Upload your evidence documents here — certificates of analysis, audit reports, food safety plans, and any other materials requested by your importer."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
            <div className="border-b border-line bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">Your Submitted Documents</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Document</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Category</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Submitted</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Review Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Reviewer Notes</th>
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
                      <StatusBadge tone={statusTone(doc.approval_status)}>
                        {statusLabel(doc.approval_status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{doc.review_notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
