"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2, ChevronUp, ChevronDown, ChevronsUpDown,
  Search, Building2, Package, Warehouse, X
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

export type EvidenceRow = {
  id: string;
  title: string;
  original_filename: string | null;
  document_kind: string;
  linked_entity_type: string | null;
  uploaded_at: string;
  evidence_status: string | null;
  review_notes: string | null;
  expiration_date: string | null;
};

type SortKey = "title" | "document_kind" | "element_type" | "uploaded_at" | "evidence_status";
type SortDir = "asc" | "desc";

function evidenceTone(status: string | null): StatusTone {
  if (status === "accepted")                              return "success";
  if (status === "under_review")                         return "info";
  if (status === "needs_revision" || status === "rejected") return "danger";
  if (status === "submitted")                            return "warning";
  return "neutral";
}

function evidenceLabel(status: string | null): string {
  if (!status || status === "not_submitted") return "Not Submitted";
  return {
    accepted:       "Accepted",
    expired:        "Expired",
    needs_revision: "Needs Revision",
    rejected:       "Rejected",
    submitted:      "Submitted",
    under_review:   "Under Review",
  }[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function elementType(linkedEntityType: string | null): string {
  if (linkedEntityType === "product")  return "Product";
  if (linkedEntityType === "facility") return "Facility";
  return "Corporate";
}

function ElementIcon({ type }: { type: string }) {
  if (type === "Product")  return <Package  className="h-3.5 w-3.5 shrink-0 text-slate-400" />;
  if (type === "Facility") return <Warehouse className="h-3.5 w-3.5 shrink-0 text-slate-400" />;
  return <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />;
}

function SortIcon({ col, current, dir }: { col: SortKey; current: SortKey; dir: SortDir }) {
  if (col !== current) return <ChevronsUpDown className="ml-1 inline h-3 w-3 text-slate-400" />;
  return dir === "asc"
    ? <ChevronUp   className="ml-1 inline h-3 w-3 text-forest" />
    : <ChevronDown className="ml-1 inline h-3 w-3 text-forest" />;
}

export function MyEvidenceTable({ rows }: { rows: EvidenceRow[] }) {
  const router  = useRouter();
  const [query,   setQuery]   = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("uploaded_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [removing, startRemove] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return rows
      .filter((row) => {
        if (!q) return true;
        return (
          row.title.toLowerCase().includes(q) ||
          row.document_kind.toLowerCase().includes(q) ||
          elementType(row.linked_entity_type).toLowerCase().includes(q) ||
          evidenceLabel(row.evidence_status).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        let va = "", vb = "";
        if (sortKey === "title")          { va = a.title;                      vb = b.title; }
        if (sortKey === "document_kind")  { va = a.document_kind;              vb = b.document_kind; }
        if (sortKey === "element_type")   { va = elementType(a.linked_entity_type); vb = elementType(b.linked_entity_type); }
        if (sortKey === "uploaded_at")    { va = a.uploaded_at;                vb = b.uploaded_at; }
        if (sortKey === "evidence_status"){ va = a.evidence_status ?? "";      vb = b.evidence_status ?? ""; }
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      });
  }, [rows, query, sortKey, sortDir]);

  async function remove(id: string) {
    if (!confirm("Remove this document? It will be hidden from dashboards but kept for audit history.")) return;
    setRemovingId(id);
    startRemove(async () => {
      const { createBrowserSupabaseClient } = await import("@/lib/supabase/browser");
      const supabase = createBrowserSupabaseClient();
      await (supabase.from("documents") as any)
        .update({ soft_deleted_at: new Date().toISOString() })
        .eq("id", id);
      router.refresh();
      setRemovingId(null);
    });
  }

  const thClass = "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 cursor-pointer select-none hover:text-forest transition whitespace-nowrap";
  const tdClass = "px-4 py-3 text-sm";

  const pendingCount = rows.filter((r) => r.evidence_status === "submitted" || r.evidence_status === "under_review").length;
  const revisionCount = rows.filter((r) => r.evidence_status === "needs_revision").length;

  return (
    <div className="space-y-4">
      {/* Alerts */}
      {revisionCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-900">
            {revisionCount} document{revisionCount !== 1 ? "s" : ""} need{revisionCount === 1 ? "s" : ""} revision
          </p>
          <ul className="mt-2 space-y-1">
            {rows.filter((r) => r.evidence_status === "needs_revision").map((r) => (
              <li key={r.id} className="text-sm text-amber-800">
                <span className="font-medium">{r.title}</span>
                {r.review_notes && <span className="text-amber-700"> — {r.review_notes}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-slate-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-700">Stored Documents</h3>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {pendingCount} awaiting review
              </span>
            )}
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents…"
              className="h-8 w-56 rounded-md border border-line bg-white pl-8 pr-3 text-sm outline-none focus:border-forest"
            />
            {query && (
              <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
              </button>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            {query ? `No documents match "${query}"` : "No documents uploaded yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50/50">
                <tr>
                  <th className={thClass} onClick={() => toggleSort("title")}>
                    Document <SortIcon col="title" current={sortKey} dir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => toggleSort("document_kind")}>
                    Category <SortIcon col="document_kind" current={sortKey} dir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => toggleSort("element_type")}>
                    Element Type <SortIcon col="element_type" current={sortKey} dir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => toggleSort("uploaded_at")}>
                    Submitted <SortIcon col="uploaded_at" current={sortKey} dir={sortDir} />
                  </th>
                  <th className={thClass} onClick={() => toggleSort("evidence_status")}>
                    Status <SortIcon col="evidence_status" current={sortKey} dir={sortDir} />
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((row) => {
                  const elType = elementType(row.linked_entity_type);
                  return (
                    <tr key={row.id} className={`transition-colors hover:bg-slate-50 ${row.evidence_status === "needs_revision" ? "bg-amber-50/40" : ""}`}>
                      <td className={tdClass}>
                        <p className="font-medium text-ink">{row.title}</p>
                        {row.original_filename && (
                          <p className="text-xs text-slate-400">{row.original_filename}</p>
                        )}
                      </td>
                      <td className={tdClass + " text-slate-600"}>{row.document_kind}</td>
                      <td className={tdClass}>
                        <span className="flex items-center gap-1.5 text-slate-600">
                          <ElementIcon type={elType} />
                          {elType}
                        </span>
                      </td>
                      <td className={tdClass + " text-slate-500 whitespace-nowrap"}>
                        {new Date(row.uploaded_at).toLocaleDateString()}
                      </td>
                      <td className={tdClass}>
                        <StatusBadge tone={evidenceTone(row.evidence_status)}>
                          {evidenceLabel(row.evidence_status)}
                        </StatusBadge>
                        {row.expiration_date && (
                          <p className="mt-1 text-xs text-slate-400">Exp: {row.expiration_date}</p>
                        )}
                      </td>
                      <td className={tdClass + " max-w-xs text-slate-500"}>
                        {row.review_notes ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          disabled={removing && removingId === row.id}
                          onClick={() => remove(row.id)}
                          title="Remove document"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
