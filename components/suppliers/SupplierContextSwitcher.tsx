"use client";

import { useRouter } from "next/navigation";
import { Building2, ChevronDown } from "lucide-react";

type LinkedSupplier = { id: string; company_name: string };

export function SupplierContextSwitcher({
  ownId,
  ownLabel,
  linkedSuppliers,
  currentViewId,
  basePath,
}: {
  ownId:            string;
  ownLabel:         string;
  linkedSuppliers:  LinkedSupplier[];
  currentViewId:    string;
  basePath:         string;  // e.g. "/facilities" or "/products"
}) {
  const router = useRouter();
  const isViewingOwn = currentViewId === ownId || !currentViewId;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === ownId) {
      router.push(basePath);
    } else {
      router.push(`${basePath}?view=${val}`);
    }
  }

  return (
    <div className="mt-4 flex items-center gap-3 rounded-lg border border-line bg-slate-50 px-4 py-3">
      <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="text-sm font-medium text-slate-600">Viewing:</span>
      <div className="relative">
        <select
          value={isViewingOwn ? ownId : currentViewId}
          onChange={onChange}
          className="h-8 appearance-none rounded-md border border-line bg-white pl-3 pr-8 text-sm font-semibold text-ink outline-none focus:border-forest"
        >
          <option value={ownId}>{ownLabel}</option>
          {linkedSuppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.company_name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </div>
      {!isViewingOwn && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
          Viewing linked supplier
        </span>
      )}
    </div>
  );
}
