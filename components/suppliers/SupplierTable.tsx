"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AddSupplierForm } from "@/components/suppliers/AddSupplierForm";
import { Building2 } from "lucide-react";
import type { StatusTone } from "@/types/platform";
import type { Country } from "@/types/database";

type CountryOption = Pick<Country, "country_code" | "country_name">;

export type SupplierRow = {
  id: string;
  company_name: string;
  country: string;
  approval_status: string;
  certification_status: string;
  fda_registration_number: string | null;
  contact_json: Record<string, string> | null;
  evidence_count?: number;
  updated_at: string;
};

function approvalTone(status: string): StatusTone {
  if (status === "approved" || status === "active") return "success";
  if (status === "pending_review") return "warning";
  if (status === "suspended" || status === "rejected") return "danger";
  return "neutral";
}

function approvalLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SupplierTable({ countries, suppliers }: { countries: CountryOption[]; suppliers: SupplierRow[] }) {
  const [showForm, setShowForm] = useState(false);

  if (suppliers.length === 0) {
    return (
      <>
        {showForm && <AddSupplierForm countries={countries} onClose={() => setShowForm(false)} />}
        <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-slate-50 px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-white shadow-soft">
            <Building2 className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">No suppliers yet</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
            Add your first foreign supplier to begin tracking FSVP compliance, evidence, and verification activities.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
          >
            Add your first supplier
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {showForm && <AddSupplierForm countries={countries} onClose={() => setShowForm(false)} />}
      <div className="mt-6">
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
          >
            Add supplier
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Country</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">FDA Registration</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Evidence</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {suppliers.map((supplier) => {
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
                      {supplier.contact_json?.email && (
                        <p className="text-xs text-slate-500">{supplier.contact_json.email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{supplier.country}</td>
                    <td className="px-4 py-3 text-slate-600">{supplier.fda_registration_number ?? "-"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={tone}>{approvalLabel(supplier.approval_status)}</StatusBadge>
                    </td>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
