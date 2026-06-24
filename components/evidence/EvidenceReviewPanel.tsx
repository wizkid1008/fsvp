"use client";

import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, XCircle, AlertCircle, AlertTriangle,
  FileText, X, ExternalLink, Filter, ChevronDown, ChevronUp, Building2, PackageSearch,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

type EvidenceStatus = "not_submitted" | "submitted" | "under_review" | "accepted" | "needs_revision" | "rejected" | "expired";

interface ReviewItem {
  id: string;
  title: string;
  document_kind: string;
  original_filename: string | null;
  has_file: boolean;
  uploaded_at: string;
  evidence_status: EvidenceStatus;
  review_notes: string | null;
  expiration_date: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  facility_id: string | null;
  entity_name: string | null;
  supplier_name: string;
  importer_name: string | null;
  requirement_item_name: string | null;
  is_critical_blocker: boolean;
  uploaded_by_name: string | null;
}

interface EntityContext {
  type: "facility" | "product";
  name: string;
  subtype: string | null;
  location: string | null;
  fda_reg: string | null;
  certifications: string[] | null;
  status: string | null;
  supplier_name: string | null;
  facility_name?: string | null;
}

interface EntityDoc {
  id: string;
  title: string;
  document_kind: string;
  evidence_status: string;
  uploaded_at: string;
  expiration_date: string | null;
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

function daysUntilExpiry(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function ExpiryBadge({ dateStr }: { dateStr: string | null }) {
  const days = daysUntilExpiry(dateStr);
  if (days === null) return <span className="text-xs text-slate-400">—</span>;
  if (days < 0)  return <span className="text-xs font-semibold text-red-600">Expired</span>;
  if (days <= 30) return <span className="text-xs font-semibold text-red-600">{days}d left</span>;
  if (days <= 90) return <span className="text-xs font-semibold text-amber-600">{days}d left</span>;
  return <span className="text-xs text-slate-500">{new Date(dateStr!).toLocaleDateString()}</span>;
}

// ── Slide-out review panel ─────────────────────────────────────────────────

function ReviewSlideOut({ item, onClose }: { item: ReviewItem; onClose: () => void }) {
  const router = useRouter();
  const [notes, setNotes]               = useState(item.review_notes ?? "");
  const [expiryDate, setExpiryDate]     = useState(item.expiration_date ?? "");
  const [pending, startTransition]      = useTransition();
  const [error, setError]               = useState<string | null>(null);
  const [success, setSuccess]           = useState<string | null>(null);

  // Entity context
  const [entityCtx, setEntityCtx]       = useState<{ entity: EntityContext; documents: EntityDoc[] } | null>(null);
  const [entityLoading, setEntityLoading] = useState(false);
  const [entityOpen, setEntityOpen]     = useState(true);

  const entityType = item.linked_entity_type === "product" ? "product"
    : item.facility_id || item.linked_entity_type === "facility" ? "facility"
    : null;
  const entityId = item.linked_entity_type === "product"
    ? item.linked_entity_id
    : item.facility_id ?? item.linked_entity_id;

  useEffect(() => {
    if (!entityType || !entityId) return;
    setEntityLoading(true);
    fetch(`/api/reviewer/entity-context?type=${entityType}&id=${entityId}`)
      .then((r) => r.json())
      .then((data) => { if (data.entity) setEntityCtx(data); })
      .finally(() => setEntityLoading(false));
  }, [entityType, entityId]);

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
        body: JSON.stringify({
          document_id:     item.id,
          decision,
          notes:           notes.trim() || undefined,
          expiration_date: expiryDate || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setSuccess(decision === "accepted" ? "Accepted!" : decision === "needs_revision" ? "Revision requested." : decision === "rejected" ? "Rejected." : "Marked under review.");
      router.refresh();
      setTimeout(() => { onClose(); }, 900);
    });
  }

  const isResolved = item.evidence_status === "accepted";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 flex-wrap">
              {item.is_critical_blocker && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 uppercase tracking-wide">
                  <AlertTriangle className="h-3 w-3" /> Critical
                </span>
              )}
              <StatusBadge tone={evidenceTone(item.evidence_status)}>
                {evidenceLabel(item.evidence_status)}
              </StatusBadge>
            </div>
            <h2 className="mt-1.5 text-base font-bold text-ink leading-snug">{item.title}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{item.document_kind}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-slate-100 text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Context chain */}
        <div className="border-b border-line bg-slate-50 px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-slate-600">
            <span className="font-semibold text-ink">{item.supplier_name}</span>
            {item.importer_name && (
              <><span className="text-slate-400">→</span><span>{item.importer_name}</span></>
            )}
            {item.entity_name && (
              <><span className="text-slate-400">→</span>
              <span className="capitalize">{item.linked_entity_type ?? ""} {item.entity_name}</span></>
            )}
            {item.requirement_item_name && (
              <><span className="text-slate-400">→</span><span className="text-slate-500">{item.requirement_item_name}</span></>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>Submitted {new Date(item.uploaded_at).toLocaleDateString()}</span>
            {item.uploaded_by_name && <span>by {item.uploaded_by_name}</span>}
            {item.original_filename && (
              <span className="truncate max-w-[200px] text-slate-400">{item.original_filename}</span>
            )}
          </div>
        </div>

        {/* Expiry + view doc row */}
        <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
          <div className="text-xs text-slate-500">
            Expiry: <ExpiryBadge dateStr={item.expiration_date} />
          </div>
          {item.has_file && (
            <a
              href={`/api/documents/download?id=${item.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View Document
            </a>
          )}
          {!item.has_file && (
            <span className="text-xs text-slate-400 italic">No file attached</span>
          )}
        </div>

        {/* Entity context panel */}
        {(entityType) && (
          <div className="border-b border-line">
            <button
              onClick={() => setEntityOpen((o) => !o)}
              className="flex w-full items-center justify-between px-5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <span className="flex items-center gap-1.5">
                {entityType === "facility"
                  ? <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  : <PackageSearch className="h-3.5 w-3.5 text-slate-400" />}
                {entityType === "facility" ? "Facility" : "Product"} Details
              </span>
              {entityOpen ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
            </button>

            {entityOpen && (
              <div className="px-5 pb-4">
                {entityLoading && (
                  <p className="text-xs text-slate-400 py-2">Loading…</p>
                )}
                {!entityLoading && entityCtx && (
                  <div className="space-y-3">
                    {/* Entity details */}
                    <div className="rounded-md border border-line bg-slate-50 p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      {entityCtx.entity.subtype && (
                        <>
                          <span className="text-slate-400">Type</span>
                          <span className="text-ink font-medium capitalize">{entityCtx.entity.subtype}</span>
                        </>
                      )}
                      {entityCtx.entity.location && (
                        <>
                          <span className="text-slate-400">{entityType === "facility" ? "Country" : "Origin"}</span>
                          <span className="text-ink font-medium">{entityCtx.entity.location}</span>
                        </>
                      )}
                      {entityCtx.entity.fda_reg && (
                        <>
                          <span className="text-slate-400">FDA Reg #</span>
                          <span className="text-ink font-medium font-mono">{entityCtx.entity.fda_reg}</span>
                        </>
                      )}
                      {entityCtx.entity.facility_name && (
                        <>
                          <span className="text-slate-400">Facility</span>
                          <span className="text-ink font-medium">{entityCtx.entity.facility_name}</span>
                        </>
                      )}
                      {entityCtx.entity.status && (
                        <>
                          <span className="text-slate-400">Approval</span>
                          <span className="text-ink font-medium capitalize">{entityCtx.entity.status.replace(/_/g, " ")}</span>
                        </>
                      )}
                      {entityCtx.entity.certifications && entityCtx.entity.certifications.length > 0 && (
                        <>
                          <span className="text-slate-400">Certs</span>
                          <span className="text-ink font-medium">{entityCtx.entity.certifications.join(", ")}</span>
                        </>
                      )}
                    </div>

                    {/* Other documents for this entity */}
                    {entityCtx.documents.length > 1 && (
                      <div>
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                          All documents for this {entityType} ({entityCtx.documents.length})
                        </p>
                        <div className="space-y-1">
                          {entityCtx.documents.map((doc) => (
                            <div key={doc.id} className={`flex items-center justify-between rounded px-2.5 py-1.5 text-xs ${doc.id === item.id ? "bg-forest/5 border border-forest/20" : "bg-slate-50"}`}>
                              <div className="min-w-0">
                                <p className={`font-medium truncate ${doc.id === item.id ? "text-forest" : "text-ink"}`}>{doc.title}</p>
                                <p className="text-slate-400">{doc.document_kind}</p>
                              </div>
                              <StatusBadge tone={evidenceTone(doc.evidence_status as EvidenceStatus)}>
                                {evidenceLabel(doc.evidence_status as EvidenceStatus)}
                              </StatusBadge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {!entityLoading && !entityCtx && (
                  <p className="text-xs text-slate-400 py-2">No entity details found.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Previous notes */}
        {item.review_notes && !success && (
          <div className="mx-5 mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span className="font-semibold">Previous notes: </span>{item.review_notes}
          </div>
        )}

        {/* Review form */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {success ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-base font-semibold text-ink">{success}</p>
            </div>
          ) : isResolved ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              <p className="text-sm font-semibold text-emerald-700">This document has been accepted.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Expiration date (optional)
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Reviewer notes <span className="text-slate-400 font-normal">(required for revision / rejection)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes for the supplier…"
                  rows={4}
                  className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink placeholder-slate-400 focus:border-forest focus:outline-none resize-none"
                />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}
        </div>

        {/* Action buttons */}
        {!isResolved && !success && (
          <div className="border-t border-line px-5 py-4 grid grid-cols-2 gap-2">
            <button onClick={() => decide("under_review")} disabled={pending}
              className="h-10 rounded-md border border-sky-300 bg-sky-50 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
              Mark Under Review
            </button>
            <button onClick={() => decide("accepted")} disabled={pending}
              className="h-10 rounded-md bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" /> Accept
            </button>
            <button onClick={() => decide("needs_revision")} disabled={pending}
              className="h-10 rounded-md border border-amber-300 bg-amber-50 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 flex items-center justify-center gap-1.5">
              <AlertCircle className="h-4 w-4" /> Request Revision
            </button>
            <button onClick={() => decide("rejected")} disabled={pending}
              className="h-10 rounded-md border border-red-300 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 flex items-center justify-center gap-1.5">
              <XCircle className="h-4 w-4" /> Reject
            </button>
            {pending && <p className="col-span-2 text-center text-xs text-slate-400">Saving…</p>}
          </div>
        )}
      </div>
    </>
  );
}

// ── Filter bar ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all",           label: "All Statuses" },
  { value: "submitted",     label: "Submitted" },
  { value: "under_review",  label: "Under Review" },
  { value: "needs_revision",label: "Needs Revision" },
  { value: "accepted",      label: "Accepted" },
  { value: "rejected",      label: "Rejected" },
];

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: "all",  label: "Any Expiry" },
  { value: "30",   label: "Expires ≤ 30 days" },
  { value: "60",   label: "Expires ≤ 60 days" },
  { value: "90",   label: "Expires ≤ 90 days" },
  { value: "past", label: "Already expired" },
];

// ── Main panel ─────────────────────────────────────────────────────────────

export function EvidenceReviewPanel({ items }: { items: ReviewItem[] }) {
  const [statusFilter, setStatusFilter]     = useState("all");
  const [criticalOnly, setCriticalOnly]     = useState(false);
  const [kindFilter, setKindFilter]         = useState("all");
  const [expiryFilter, setExpiryFilter]     = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [entityFilter, setEntityFilter]     = useState("all");
  const [selected, setSelected]             = useState<ReviewItem | null>(null);

  const kinds = useMemo(() => {
    const set = new Set(items.map((i) => i.document_kind).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);

  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of items) map.set(i.supplier_name, i.supplier_name);
    return Array.from(map.keys()).sort();
  }, [items]);

  // Entity options scoped to the selected supplier
  const entities = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      if (supplierFilter !== "all" && i.supplier_name !== supplierFilter) continue;
      if (i.entity_name) set.add(i.entity_name);
    }
    return Array.from(set).sort();
  }, [items, supplierFilter]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "all" && item.evidence_status !== statusFilter) return false;
      if (criticalOnly && !item.is_critical_blocker) return false;
      if (kindFilter !== "all" && item.document_kind !== kindFilter) return false;
      if (supplierFilter !== "all" && item.supplier_name !== supplierFilter) return false;
      if (entityFilter !== "all" && item.entity_name !== entityFilter) return false;
      if (expiryFilter !== "all") {
        const days = daysUntilExpiry(item.expiration_date);
        if (expiryFilter === "past") {
          if (days === null || days >= 0) return false;
        } else {
          const limit = parseInt(expiryFilter, 10);
          if (days === null || days < 0 || days > limit) return false;
        }
      }
      return true;
    });
  }, [items, statusFilter, criticalOnly, kindFilter, supplierFilter, entityFilter, expiryFilter]);

  const pendingInFiltered = filtered.filter(
    (i) => i.evidence_status === "submitted" || i.evidence_status === "under_review"
  ).length;

  if (items.length === 0) {
    return (
      <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-slate-50 py-16 text-center">
        <CheckCircle2 className="h-10 w-10 text-slate-300" />
        <p className="mt-3 text-base font-semibold text-ink">No evidence in queue</p>
        <p className="mt-1 text-sm text-slate-500">Submitted supplier documents will appear here for review.</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white px-4 py-3 shadow-soft">
        <Filter className="h-4 w-4 shrink-0 text-slate-400" />

        {/* Supplier filter */}
        {suppliers.length > 1 && (
          <select
            value={supplierFilter}
            onChange={(e) => { setSupplierFilter(e.target.value); setEntityFilter("all"); }}
            className="rounded-md border border-line bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-ink focus:border-forest focus:outline-none"
          >
            <option value="all">All Suppliers</option>
            {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {/* Entity filter — only shown when a supplier is selected and has multiple entities */}
        {supplierFilter !== "all" && entities.length > 1 && (
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="rounded-md border border-line bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-ink focus:border-forest focus:outline-none"
          >
            <option value="all">All Entities</option>
            {entities.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        )}

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-line bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-ink focus:border-forest focus:outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {kinds.length > 1 && (
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="rounded-md border border-line bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-ink focus:border-forest focus:outline-none"
          >
            <option value="all">All Doc Types</option>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        )}

        <select
          value={expiryFilter}
          onChange={(e) => setExpiryFilter(e.target.value)}
          className="rounded-md border border-line bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-ink focus:border-forest focus:outline-none"
        >
          {EXPIRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={criticalOnly}
            onChange={(e) => setCriticalOnly(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-red-600 focus:ring-red-400"
          />
          <span className="text-xs font-medium text-red-700">Critical blockers only</span>
        </label>

        <span className="ml-auto text-xs text-slate-400">
          {filtered.length} document{filtered.length !== 1 ? "s" : ""}
          {pendingInFiltered > 0 && ` · ${pendingInFiltered} pending`}
        </span>
      </div>

      {/* Queue table */}
      <div className="mt-3 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-slate-400">
            <FileText className="h-8 w-8 mb-2" />
            <p className="text-sm">No documents match the current filters.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Supplier → Entity → Requirement</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Document</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Expiry</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  {/* Context chain */}
                  <td className="px-4 py-3">
                    <div className="flex items-center flex-wrap gap-x-1 text-xs">
                      <span className="font-semibold text-ink">{item.supplier_name}</span>
                      {item.entity_name && (
                        <>
                          <span className="text-slate-300">›</span>
                          <span className="text-slate-600">{item.entity_name}</span>
                        </>
                      )}
                      {item.requirement_item_name && (
                        <>
                          <span className="text-slate-300">›</span>
                          <span className="text-slate-400 truncate max-w-[180px]">{item.requirement_item_name}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {item.is_critical_blocker && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                          <AlertTriangle className="h-2.5 w-2.5" /> Critical
                        </span>
                      )}
                      {item.importer_name && (
                        <span className="text-[11px] text-slate-400">for {item.importer_name}</span>
                      )}
                    </div>
                  </td>

                  {/* Document */}
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink text-xs leading-snug">{item.title}</p>
                    <p className="text-[11px] text-slate-400">{item.document_kind}</p>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge tone={evidenceTone(item.evidence_status)}>
                      {evidenceLabel(item.evidence_status)}
                    </StatusBadge>
                  </td>

                  {/* Expiry */}
                  <td className="px-4 py-3">
                    <ExpiryBadge dateStr={item.expiration_date} />
                  </td>

                  {/* Submitted */}
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(item.uploaded_at).toLocaleDateString()}
                    {item.uploaded_by_name && (
                      <p className="text-slate-400">{item.uploaded_by_name}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-out panel */}
      {selected && (
        <ReviewSlideOut item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
