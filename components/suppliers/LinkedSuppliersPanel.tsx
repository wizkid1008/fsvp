"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2, Plus, Clock, CheckCircle2, XCircle,
  AlertCircle, Warehouse, Package, FileText, ArrowRight
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InviteSupplierForm } from "./InviteSupplierForm";
import type { StatusTone } from "@/types/platform";
import type { Country } from "@/types/database";

type CountryOption = Pick<Country, "country_code" | "country_name">;

type SupplierCounts = {
  facilities: number;
  products:   number;
  documents:  number;
  accepted:   number;
};

type LinkedSupplier = {
  id: string;
  status: string;
  invite_email: string | null;
  accepted_at:  string | null;
  notes:        string | null;
  counts:       SupplierCounts | null;
  supplier: {
    id: string;
    company_name: string;
    country: string;
    approval_status: string;
    supplier_type: string | null;
  } | null;
};

function linkTone(status: string): StatusTone {
  if (status === "active")         return "success";
  if (status === "pending_invite") return "warning";
  if (status === "declined")       return "danger";
  return "neutral";
}

function linkLabel(status: string): string {
  if (status === "active")         return "Active";
  if (status === "pending_invite") return "Invite Sent";
  if (status === "declined")       return "Declined";
  if (status === "terminated")     return "Terminated";
  return status;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "active")         return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />;
  if (status === "pending_invite") return <Clock        className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />;
  if (status === "declined")       return <XCircle      className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />;
  return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />;
}

function CountPill({ icon: Icon, count, label }: { icon: React.ElementType; count: number; label: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-slate-500">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      <span className="font-semibold text-ink">{count}</span>
      <span>{label}</span>
    </span>
  );
}

export function LinkedSuppliersPanel({
  exporterId,
  countries,
  linkedSuppliers = [],
}: {
  exporterId:      string | null;
  countries:       CountryOption[];
  linkedSuppliers?: LinkedSupplier[];
}) {
  const [showForm, setShowForm] = useState(false);

  const active  = linkedSuppliers.filter((l) => l.status === "active");
  const pending = linkedSuppliers.filter((l) => l.status === "pending_invite");
  const other   = linkedSuppliers.filter((l) => l.status !== "active" && l.status !== "pending_invite");

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-ink">Upstream Suppliers</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Manufacturers or processors that produce goods you export.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex h-9 items-center gap-1.5 rounded-md bg-forest px-3 text-sm font-semibold text-white hover:bg-[#195f4d] transition"
        >
          <Plus className="h-4 w-4" /> Add Supplier
        </button>
      </div>

      {showForm && (
        <InviteSupplierForm countries={countries} onClose={() => setShowForm(false)} />
      )}

      {/* Empty state */}
      {linkedSuppliers.length === 0 && (
        <div className="px-5 py-10">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <Building2 className="h-6 w-6 text-slate-400" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-ink">No upstream suppliers linked yet</h3>
            <p className="mt-2 text-sm text-slate-500">
              If you source from other manufacturers or processors, add them here.
              If you manufacture your own goods, skip this — your facilities and
              products go directly under your own corporate profile.
            </p>
            <div className="mt-6 rounded-lg border border-line bg-slate-50 px-4 py-4 text-left text-xs text-slate-600 space-y-2">
              <p className="font-semibold text-slate-700">How it works:</p>
              <div className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-forest text-[10px] font-bold text-white">1</span>
                <span>Add a supplier by company name and optional email</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-forest text-[10px] font-bold text-white">2</span>
                <span>Go to Facilities and add their manufacturing locations</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-forest text-[10px] font-bold text-white">3</span>
                <span>Go to Products and link each product to the right facility</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-forest text-[10px] font-bold text-white">4</span>
                <span>Upload compliance evidence against each facility and product</span>
              </div>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-forest text-sm font-semibold text-forest hover:bg-emerald-50 transition"
            >
              <Plus className="h-4 w-4" /> Add your first supplier
            </button>
          </div>
        </div>
      )}

      {/* Active suppliers */}
      {active.length > 0 && (
        <div className="divide-y divide-line">
          {active.map((link) => (
            <div key={link.id} className="px-5 py-4 hover:bg-slate-50 transition">
              <div className="flex items-start gap-3">
                <StatusIcon status={link.status} />
                <div className="min-w-0 flex-1">
                  {/* Name + badge */}
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {link.supplier?.company_name ?? "Unknown"}
                    </p>
                    <StatusBadge tone={linkTone(link.status)}>{linkLabel(link.status)}</StatusBadge>
                    {link.supplier?.supplier_type && (
                      <span className="text-xs capitalize text-slate-400">
                        {link.supplier.supplier_type.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>

                  {/* Country + notes */}
                  <p className="mt-0.5 text-xs text-slate-500">
                    {link.supplier?.country}
                    {link.notes ? ` · ${link.notes}` : ""}
                  </p>

                  {/* Counts */}
                  {link.counts && (
                    <div className="mt-2 flex flex-wrap gap-4">
                      <CountPill icon={Warehouse} count={link.counts.facilities} label="facilities" />
                      <CountPill icon={Package}   count={link.counts.products}   label="products" />
                      <CountPill icon={FileText}  count={link.counts.accepted}   label={`of ${link.counts.documents} docs accepted`} />
                    </div>
                  )}

                  {/* Next step prompt when no facilities yet */}
                  {link.counts && link.counts.facilities === 0 && link.supplier && (
                    <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Next step: add a facility for this supplier
                    </p>
                  )}
                  {link.counts && link.counts.facilities > 0 && link.counts.products === 0 && link.supplier && (
                    <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Next step: add products for this supplier
                    </p>
                  )}
                </div>

                {/* Quick links */}
                {link.supplier && (
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <Link
                      href={`/facilities?view=${link.supplier.id}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium text-slate-600 hover:border-forest hover:text-forest transition"
                    >
                      <Warehouse className="h-3.5 w-3.5" />
                      Facilities
                      {link.counts && link.counts.facilities > 0 && (
                        <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold">{link.counts.facilities}</span>
                      )}
                    </Link>
                    <Link
                      href={`/products?view=${link.supplier.id}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium text-slate-600 hover:border-forest hover:text-forest transition"
                    >
                      <Package className="h-3.5 w-3.5" />
                      Products
                      {link.counts && link.counts.products > 0 && (
                        <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold">{link.counts.products}</span>
                      )}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending invites */}
      {pending.length > 0 && (
        <>
          <div className="border-t border-line bg-slate-50 px-5 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pending Invites</p>
          </div>
          <div className="divide-y divide-line">
            {pending.map((link) => (
              <div key={link.id} className="flex items-center gap-3 px-5 py-3">
                <Clock className="h-4 w-4 shrink-0 text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{link.supplier?.company_name ?? "Unknown"}</p>
                  <p className="text-xs text-slate-500">
                    Invite sent to {link.invite_email ?? "unknown email"} · awaiting acceptance
                  </p>
                </div>
                <StatusBadge tone="warning">Invite Sent</StatusBadge>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Declined / terminated */}
      {other.length > 0 && (
        <>
          <div className="border-t border-line bg-slate-50 px-5 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Inactive</p>
          </div>
          <div className="divide-y divide-line">
            {other.map((link) => (
              <div key={link.id} className="flex items-center gap-3 px-5 py-3 opacity-60">
                <XCircle className="h-4 w-4 shrink-0 text-slate-400" />
                <p className="min-w-0 flex-1 text-sm text-slate-600">{link.supplier?.company_name ?? "Unknown"}</p>
                <StatusBadge tone={linkTone(link.status)}>{linkLabel(link.status)}</StatusBadge>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Footer CTA when suppliers exist but some have gaps */}
      {active.length > 0 && (
        <div className="border-t border-line px-5 py-3">
          <Link href="/facilities" className="flex items-center gap-1 text-xs font-medium text-forest hover:underline">
            Go to Facilities to add or manage supplier facilities <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </section>
  );
}
