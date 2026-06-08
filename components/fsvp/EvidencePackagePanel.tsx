"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, FileCheck2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface AttachedDoc {
  id: string;
  document_id: string;
  title: string;
  document_kind: string;
  requirement_item_name: string | null;
  attached_at: string;
  notes: string | null;
}

interface AvailableDoc {
  id: string;
  title: string;
  document_kind: string;
  requirement_item_name: string | null;
  expiration_date: string | null;
}

export function EvidencePackagePanel({
  recordId,
  attachedDocs,
  availableDocs,
  readonly,
}: {
  recordId: string;
  attachedDocs: AttachedDoc[];
  availableDocs: AvailableDoc[];
  readonly: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const attachedDocIds = new Set(attachedDocs.map((d) => d.document_id));
  const unattached = availableDocs.filter((d) => !attachedDocIds.has(d.id));

  function handleAttach() {
    if (!selectedId) { setError("Select a document."); return; }
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/fsvp-records/${recordId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: selectedId }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setSelectedId("");
      setShowAdd(false);
      router.refresh();
    });
  }

  function handleDetach(documentId: string) {
    if (!confirm("Remove this document from the FSVP evidence package?")) return;
    startTransition(async () => {
      await fetch(`/api/fsvp-records/${recordId}/evidence`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: documentId }),
      });
      router.refresh();
    });
  }

  return (
    <div>
      {attachedDocs.length === 0 ? (
        <div className="rounded-md border border-dashed border-line bg-slate-50 py-8 text-center">
          <FileCheck2 className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-ink">No evidence attached</p>
          <p className="mt-1 text-xs text-slate-500">
            Attach accepted evidence documents to this FSVP record.
          </p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-slate-50">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Document</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Requirement</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Attached</th>
              {!readonly && <th className="w-10 px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {attachedDocs.map((doc) => (
              <tr key={doc.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{doc.title}</p>
                  <p className="text-xs text-slate-400 capitalize">{doc.document_kind.replace(/_/g, " ")}</p>
                  {doc.notes && <p className="mt-0.5 text-xs text-slate-500">{doc.notes}</p>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {doc.requirement_item_name ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(doc.attached_at).toLocaleDateString()}
                </td>
                {!readonly && (
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDetach(doc.document_id)}
                      disabled={isPending}
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!readonly && (
        <div className="mt-3">
          {showAdd ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="h-9 flex-1 rounded-md border border-line bg-white px-3 text-sm text-ink focus:border-forest focus:outline-none"
              >
                <option value="">Select accepted document…</option>
                {unattached.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                    {doc.requirement_item_name ? ` — ${doc.requirement_item_name}` : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAttach}
                disabled={isPending || !selectedId}
                className="h-9 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-[#195f4d] disabled:opacity-50"
              >
                {isPending ? "Attaching…" : "Attach"}
              </button>
              <button
                onClick={() => { setShowAdd(false); setError(null); }}
                className="h-9 rounded-md border border-line px-3 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              disabled={unattached.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              {unattached.length === 0 ? "All accepted evidence attached" : "Attach Evidence"}
            </button>
          )}
          {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
