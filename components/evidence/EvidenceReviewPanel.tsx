"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

type EvidenceStatus = "not_submitted" | "submitted" | "under_review" | "accepted" | "needs_revision" | "rejected" | "expired";

interface ReviewDocument {
  id: string;
  title: string;
  document_kind: string;
  original_filename: string | null;
  uploaded_at: string;
  evidence_status: EvidenceStatus;
  review_notes: string | null;
  expiration_date: string | null;
  linked_entity_type: string | null;
  requirement_item_name: string | null;
  uploaded_by_name: string | null;
}

interface SupplierGroup {
  supplier_id: string;
  supplier_name: string;
  documents: ReviewDocument[];
}

function evidenceTone(status: EvidenceStatus): StatusTone {
  if (status === "accepted") return "success";
  if (status === "under_review") return "info";
  if (status === "submitted") return "warning";
  if (status === "needs_revision" || status === "rejected" || status === "expired") return "danger";
  return "neutral";
}

function evidenceLabel(status: EvidenceStatus): string {
  const map: Record<EvidenceStatus, string> = {
    not_submitted: "Not Submitted",
    submitted: "Submitted",
    under_review: "Under Review",
    accepted: "Accepted",
    needs_revision: "Needs Revision",
    rejected: "Rejected",
    expired: "Expired",
  };
  return map[status] ?? status;
}

function ReviewActions({ doc }: { doc: ReviewDocument }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(doc.review_notes ?? "");
  const [expDate, setExpDate] = useState(doc.expiration_date ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "under_review" | "accepted" | "needs_revision" | "rejected") {
    if ((decision === "needs_revision" || decision === "rejected") && !notes.trim()) {
      setError("Notes are required when requesting revision or rejecting.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/evidence/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: doc.id, decision, notes: notes.trim() || undefined, expiration_date: expDate || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setOpen(false);
      router.refresh();
    });
  }

  if (doc.evidence_status === "accepted") {
    return <span className="text-xs text-emerald-600 font-semibold">Accepted</span>;
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Review {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="mt-2 w-72 rounded-lg border border-line bg-white p-3 shadow-lg">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reviewer notes (required for revision/rejection)"
            rows={3}
            className="w-full rounded-md border border-line px-2.5 py-2 text-xs text-ink placeholder-slate-400 focus:border-forest focus:outline-none resize-none"
          />
          <div className="mt-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Expiration date (optional)</label>
            <input
              type="date"
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
              className="h-8 w-full rounded-md border border-line px-2 text-xs text-ink focus:border-forest focus:outline-none"
            />
          </div>
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button onClick={() => decide("under_review")} disabled={pending}
              className="h-8 rounded-md border border-sky-300 bg-sky-50 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
              Start Review
            </button>
            <button onClick={() => decide("accepted")} disabled={pending}
              className="h-8 rounded-md bg-emerald-600 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />Accept
            </button>
            <button onClick={() => decide("needs_revision")} disabled={pending}
              className="h-8 rounded-md border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
              <AlertCircle className="inline h-3.5 w-3.5 mr-1" />Revision
            </button>
            <button onClick={() => decide("rejected")} disabled={pending}
              className="h-8 rounded-md border border-red-300 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">
              <XCircle className="inline h-3.5 w-3.5 mr-1" />Reject
            </button>
          </div>
          {pending && <p className="mt-1 text-xs text-slate-400">Saving…</p>}
        </div>
      )}
    </div>
  );
}

export function EvidenceReviewPanel({ groups }: { groups: SupplierGroup[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(groups.filter((g) => g.documents.some((d) => d.evidence_status !== "accepted")).map((g) => g.supplier_id))
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (groups.length === 0) {
    return (
      <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-slate-50 py-16 text-center">
        <CheckCircle2 className="h-10 w-10 text-slate-300" />
        <p className="mt-3 text-base font-semibold text-ink">No evidence in queue</p>
        <p className="mt-1 text-sm text-slate-500">Submitted supplier documents will appear here for review.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {groups.map((group) => {
        const pendingCount = group.documents.filter(
          (d) => d.evidence_status === "submitted" || d.evidence_status === "under_review"
        ).length;
        const isOpen = expanded.has(group.supplier_id);

        return (
          <div key={group.supplier_id} className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
            <button
              onClick={() => toggle(group.supplier_id)}
              className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <p className="font-semibold text-ink">{group.supplier_name}</p>
                {pendingCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    {pendingCount} pending
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">{group.documents.length} document{group.documents.length !== 1 ? "s" : ""}</span>
                {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-slate-50">
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Document</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Linked To</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Requirement</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Submitted</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Status</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {group.documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">{doc.title}</p>
                          {doc.original_filename && (
                            <p className="text-xs text-slate-400">{doc.original_filename}</p>
                          )}
                          {doc.review_notes && (
                            <p className="mt-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                              Note: {doc.review_notes}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 capitalize">
                          {doc.linked_entity_type?.replace(/_/g, " ") ?? "Supplier-wide"}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {doc.requirement_item_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                          {doc.uploaded_by_name && (
                            <p className="text-slate-400">{doc.uploaded_by_name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge tone={evidenceTone(doc.evidence_status)}>
                            {evidenceLabel(doc.evidence_status)}
                          </StatusBadge>
                          {doc.expiration_date && (
                            <p className="mt-1 text-xs text-slate-400">Exp: {doc.expiration_date}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <ReviewActions doc={doc} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
