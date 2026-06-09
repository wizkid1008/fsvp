"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Plus, Clock, CheckCircle2, XCircle, AlertCircle, ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InviteSupplierForm } from "./InviteSupplierForm";
import type { StatusTone } from "@/types/platform";
import type { Country } from "@/types/database";

type CountryOption = Pick<Country, "country_code" | "country_name">;

type LinkedSupplier = {
  id: string;
  status: string;
  invite_email: string | null;
  accepted_at: string | null;
  notes: string | null;
  supplier: {
    id: string;
    company_name: string;
    country: string;
    approval_status: string;
    supplier_type: string | null;
  } | null;
};

function linkStatusTone(status: string): StatusTone {
  if (status === "active")         return "success";
  if (status === "pending_invite") return "warning";
  if (status === "declined")       return "danger";
  if (status === "terminated")     return "neutral";
  return "neutral";
}

function linkStatusLabel(status: string): string {
  if (status === "active")         return "Active";
  if (status === "pending_invite") return "Invite Sent";
  if (status === "declined")       return "Declined";
  if (status === "terminated")     return "Terminated";
  return status;
}

function LinkStatusIcon({ status }: { status: string }) {
  if (status === "active")         return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "pending_invite") return <Clock className="h-4 w-4 text-amber-400" />;
  if (status === "declined")       return <XCircle className="h-4 w-4 text-red-400" />;
  return <AlertCircle className="h-4 w-4 text-slate-300" />;
}

// This is a client component but receives pre-fetched data as props
export function LinkedSuppliersPanel({
  exporterId,
  supabase,
  countries,
  linkedSuppliers: initialLinkedSuppliers,
}: {
  exporterId: string | null;
  supabase?: any;
  countries: CountryOption[];
  linkedSuppliers?: LinkedSupplier[];
}) {
  const [showForm, setShowForm] = useState(false);

  // Data is server-fetched and passed via the server wrapper (LinkedSuppliersPanelServer)
  const linked = initialLinkedSuppliers ?? [];

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Upstream Suppliers</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Companies that manufacture or process goods you export.
          </p>
        </div>
        {exporterId && (
          <button
            onClick={() => setShowForm(true)}
            className="flex h-9 items-center gap-1.5 rounded-md bg-forest px-3 text-sm font-semibold text-white hover:bg-[#195f4d] transition"
          >
            <Plus className="h-4 w-4" /> Add Supplier
          </button>
        )}
      </div>

      {showForm && (
        <InviteSupplierForm countries={countries} onClose={() => setShowForm(false)} />
      )}

      {linked.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-8 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-slate-50">
            <Building2 className="h-5 w-5 text-slate-400" />
          </div>
          <p className="mt-3 text-sm font-semibold text-ink">No upstream suppliers yet</p>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Add suppliers that manufacture or process goods on your behalf. They can upload
            their own facility and product evidence once linked.
          </p>
          {exporterId && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 flex h-9 items-center gap-1.5 rounded-md border border-forest px-4 text-sm font-semibold text-forest hover:bg-emerald-50 transition"
            >
              <Plus className="h-4 w-4" /> Add your first supplier
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-line">
          {linked.map((link) => (
            <div key={link.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition">
              <LinkStatusIcon status={link.status} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink">
                    {link.supplier?.company_name ?? "Unknown Company"}
                  </p>
                  <StatusBadge tone={linkStatusTone(link.status)}>
                    {linkStatusLabel(link.status)}
                  </StatusBadge>
                  {link.supplier?.supplier_type && (
                    <span className="text-xs text-slate-400 capitalize">
                      {link.supplier.supplier_type.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {link.supplier?.country ?? ""}
                  {link.invite_email ? ` · ${link.invite_email}` : ""}
                  {link.notes ? ` · ${link.notes}` : ""}
                </p>
              </div>
              {link.status === "active" && link.supplier && (
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/facilities?view=${link.supplier.id}`}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-line px-3 text-xs font-medium text-slate-600 hover:border-forest hover:text-forest transition"
                  >
                    Facilities <ExternalLink className="h-3 w-3" />
                  </Link>
                  <Link
                    href={`/products?view=${link.supplier.id}`}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-line px-3 text-xs font-medium text-slate-600 hover:border-forest hover:text-forest transition"
                  >
                    Products <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
              {link.status === "pending_invite" && (
                <span className="shrink-0 text-xs text-slate-400">Awaiting acceptance</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
