"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AddSupplierForm } from "@/components/suppliers/AddSupplierForm";
import { Building2 } from "lucide-react";
import type { StatusTone } from "@/types/platform";

type Supplier = {
  id: string;
  company_name: string;
  country: string;
  approval_status: string;
  certification_status: string;
  fda_registration_number: string | null;
  contact_json: Record<string, string> | null;
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

export function SupplierTable({ suppliers }: { suppliers: Supplier[] }) {
  const [showForm, setShowForm] = useState(false);

  if (suppliers.length === 0) {
    return (
      <>
        {showForm && <AddSupplierForm onClose={() => setShowForm(false)} />}
        <EmptyState
          icon={Building2}
          title="No suppliers yet"
          description="Add your first foreign supplier to begin tracking FSVP compliance, evidence, and verification activities."
          action={{ label: "Add your first supplier", href: "#" }}
        />
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
          >
            Add your first supplier
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {showForm && <AddSupplierForm onClose={() => setShowForm(false)} />}
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
                    <td className="px-4 py-3 text-slate-600">{supplier.fda_registration_number ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={tone}>{approvalLabel(supplier.approval_status)}</StatusBadge>
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
