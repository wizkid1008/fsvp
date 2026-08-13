"use client";

import { useState, useMemo } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AddSupplierForm } from "@/components/suppliers/AddSupplierForm";
import { LinkSupplierModal } from "@/components/suppliers/LinkSupplierModal";
import { CreateExporterForm } from "@/components/suppliers/CreateExporterForm";
import { SuspensionControl, type SuspensionRow } from "@/components/suppliers/SuspensionControl";
import { Building2, Pencil, Search, Plus, Link2, MailWarning, Warehouse } from "lucide-react";
import type { StatusTone } from "@/types/platform";
import type { Country } from "@/types/database";

type CountryOption = Pick<Country, "country_code" | "country_name">;

export type SupplierRow = {
  id: string;
  company_name: string;
  legal_entity_name: string | null;
  country: string;
  website: string | null;
  approval_status: string;
  certification_status: string;
  fda_registration_number: string | null;
  contact_json: Record<string, string> | null;
  supplier_type?: string | null;
  evidence_count?: number;
  updated_at: string;
  record_mode?: string | null;
  managed_by_importer_id?: string | null;
  duns_number?: string | null;
};

// Who keeps this record up to date. "Self-managed" was ambiguous about whose
// self — read from the importer's side of the table, next to "Managed by you",
// it invited the reading that the importer manages it. The exporter does.
// The stored record_mode value is unchanged; this is the label only.
function recordModeLabel(mode: string | null | undefined, managedByMe: boolean) {
  if (mode === "importer_managed") return managedByMe ? "Managed by you" : "Managed elsewhere";
  if (mode === "claim_pending")    return "Invite pending";
  return "Managed by exporter";
}

function recordModeTone(mode: string | null | undefined): StatusTone {
  if (mode === "importer_managed") return "warning";
  if (mode === "claim_pending")    return "info";
  return "success";
}

function approvalTone(status: string): StatusTone {
  if (status === "approved" || status === "active") return "success";
  if (status === "pending_review") return "warning";
  if (status === "suspended" || status === "rejected") return "danger";
  return "neutral";
}

function approvalLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SupplierTable({
  countries,
  suppliers,
  importerId,
  suspensions = [],
}: {
  countries: CountryOption[];
  suppliers: SupplierRow[];
  importerId?: string;
  /** Live suspensions for THIS importer only — suspension is never global. */
  suspensions?: SuspensionRow[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showCreateExporter, setShowCreateExporter] = useState(false);
  const [editingExporter, setEditingExporter] = useState<SupplierRow | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const suspensionBySupplier = useMemo(
    () => new Map(suspensions.map((s) => [s.supplier_id, s])),
    [suspensions]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return suppliers.filter((s) => {
      const matchesSearch = !q ||
        s.company_name.toLowerCase().includes(q) ||
        (s.legal_entity_name?.toLowerCase().includes(q) ?? false) ||
        s.country.toLowerCase().includes(q) ||
        (s.fda_registration_number?.toLowerCase().includes(q) ?? false);
      const matchesStatus = !statusFilter || s.approval_status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [suppliers, search, statusFilter]);

  function closeForm() {
    setShowForm(false);
    setEditingSupplier(null);
  }

  function editSupplier(supplier: SupplierRow) {
    setEditingSupplier(supplier);
    setShowForm(true);
  }

  const isImporter = Boolean(importerId);

  // An importer may only edit a record their own organization manages, and only
  // until the exporter claims it. Once self-managed, the exporter owns their
  // profile and the importer keeps the relationship but loses edit rights.
  function managedByMe(s: SupplierRow) {
    return Boolean(importerId) && s.managed_by_importer_id === importerId;
  }
  function canEdit(s: SupplierRow) {
    if (!isImporter) return true;
    return managedByMe(s) && s.record_mode !== "self_managed";
  }

  function handleEditClick(s: SupplierRow) {
    if (isImporter) setEditingExporter(s);
    else editSupplier(s);
  }

  const exporterModals = (
    <>
      {showCreateExporter && (
        <CreateExporterForm countries={countries} onClose={() => setShowCreateExporter(false)} />
      )}
      {editingExporter && (
        <CreateExporterForm
          countries={countries}
          exporter={editingExporter}
          onClose={() => setEditingExporter(null)}
        />
      )}
    </>
  );

  if (suppliers.length === 0) {
    return (
      <>
        {showForm && !isImporter && <AddSupplierForm countries={countries} onClose={closeForm} />}
        {showLinkModal && <LinkSupplierModal onClose={() => setShowLinkModal(false)} />}
        {exporterModals}
        <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-slate-50 px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-white shadow-soft">
            <Building2 className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">
            {isImporter ? "No exporters yet" : "No suppliers linked yet"}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
            {isImporter
              ? "If your exporter already has an account, link to them. If they will not register — which is common — create the record yourself and maintain it on their behalf."
              : "Add your first foreign supplier to begin tracking FSVP compliance, evidence, and verification activities."}
          </p>
          {isImporter ? (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowLinkModal(true)}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
              >
                <Link2 className="h-4 w-4" />
                Link an exporter
              </button>
              <button
                type="button"
                onClick={() => setShowCreateExporter(true)}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
              >
                <Plus className="h-4 w-4" />
                Add an exporter
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
            >
              Add your first supplier
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {showForm && !isImporter && <AddSupplierForm countries={countries} supplier={editingSupplier} onClose={closeForm} />}
      {showLinkModal && <LinkSupplierModal onClose={() => setShowLinkModal(false)} />}
      {exporterModals}
      <div className="mt-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isImporter ? "Search exporters…" : "Search suppliers…"}
              className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-forest"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
          >
            <option value="">All Statuses</option>
            <option value="pending_review">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </select>
          {isImporter ? (
            <>
              <button
                onClick={() => setShowLinkModal(true)}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
              >
                <Link2 className="h-4 w-4" />
                Link an exporter
              </button>
              <button
                onClick={() => setShowCreateExporter(true)}
                title="Create a record for an exporter who will not register themselves"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
              >
                <Plus className="h-4 w-4" />
                Add an exporter
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
            >
              Add supplier
            </button>
          )}
        </div>
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">
              No {isImporter ? "exporters" : "suppliers"} match your search.
            </div>
          ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Country</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">FDA Registration</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                {isImporter && (
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Record</th>
                )}
                {isImporter && (
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Facilities</th>
                )}
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Evidence</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Last Updated</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((supplier) => {
                const tone = approvalTone(supplier.approval_status);
                const borderColor =
                  tone === "success" ? "border-l-emerald-500" :
                  tone === "warning" ? "border-l-amber-400" :
                  tone === "danger" ? "border-l-red-500" :
                  "border-l-slate-300";

                return (
                  <tr key={supplier.id} className={`relative border-l-4 ${borderColor} hover:bg-slate-50 transition-colors`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{supplier.company_name}</p>
                      {supplier.supplier_type && (
                        <span className="mt-0.5 inline-block text-xs capitalize text-slate-400">
                          {supplier.supplier_type.replace(/_/g, " ")}
                        </span>
                      )}
                      {supplier.contact_json?.email && (
                        <p className="text-xs text-slate-500">{supplier.contact_json.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{supplier.country}</td>
                    <td className="px-4 py-3 text-slate-600">{supplier.fda_registration_number ?? "-"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={tone}>{approvalLabel(supplier.approval_status)}</StatusBadge>
                    </td>
                    {isImporter && (
                      <td className="px-4 py-3">
                        <StatusBadge tone={recordModeTone(supplier.record_mode)}>
                          {recordModeLabel(supplier.record_mode, managedByMe(supplier))}
                        </StatusBadge>
                        {supplier.record_mode === "claim_pending" && (
                          <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                            <MailWarning className="h-3 w-3" />
                            awaiting their response
                          </span>
                        )}
                      </td>
                    )}
                    {isImporter && (
                      // A facility belongs to an exporter, so it is reached from
                      // that exporter's row rather than from a global page where
                      // you would have to name it again in a dropdown.
                      <td className="px-4 py-3">
                        <a
                          href={`/facilities?supplier=${supplier.id}`}
                          className="inline-flex items-center gap-1.5 font-semibold text-forest hover:underline"
                        >
                          <Warehouse className="h-3.5 w-3.5" />
                          Add facility
                        </a>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <a
                        href={`/evidence?entity=supplier&id=${supplier.id}`}
                        className="font-semibold text-forest hover:underline"
                      >
                        {supplier.evidence_count ?? 0} documents
                      </a>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(supplier.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                      {importerId && (
                        <SuspensionControl
                          supplierId={supplier.id}
                          supplierName={supplier.company_name}
                          suspension={suspensionBySupplier.get(supplier.id) ?? null}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => handleEditClick(supplier)}
                        disabled={!canEdit(supplier)}
                        title={
                          canEdit(supplier)
                            ? `Edit ${supplier.company_name}`
                            : `${supplier.company_name} maintains their own record`
                        }
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line text-slate-600 transition hover:border-forest hover:text-forest disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-line disabled:hover:text-slate-600"
                        aria-label={`Edit ${supplier.company_name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </>
  );
}
