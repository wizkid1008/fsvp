"use client";

import { useRouter } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";

type LinkedSupplier = { id: string; company_name: string };

export function SupplierContextSwitcher({
  ownId,
  ownLabel,
  linkedSuppliers,
  currentViewId,
  basePath,
}: {
  ownId:           string;
  ownLabel:        string;
  linkedSuppliers: LinkedSupplier[];
  currentViewId:   string;
  basePath:        string;
}) {
  const router = useRouter();
  const isViewingOwn = !currentViewId || currentViewId === ownId;

  function navigate(id: string | null) {
    router.push(id && id !== ownId ? `${basePath}?view=${id}` : basePath);
  }

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
      <div className="border-b border-line bg-slate-50 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Viewing</p>
      </div>
      <div className="flex flex-wrap gap-0 divide-x divide-line">
        {/* Own entity tab */}
        <button
          onClick={() => navigate(null)}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition ${
            isViewingOwn
              ? "bg-forest text-white"
              : "bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
          }`}
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          {ownLabel}
          {isViewingOwn && <span className="ml-1 text-xs font-normal opacity-75">(you)</span>}
        </button>

        {/* Linked supplier tabs */}
        {linkedSuppliers.map((s) => {
          const active = currentViewId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => navigate(s.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold transition ${
                active
                  ? "bg-forest text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50 hover:text-ink"
              }`}
            >
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              {s.company_name}
            </button>
          );
        })}
      </div>

      {/* Banner when viewing a linked supplier */}
      {!isViewingOwn && (
        <div className="flex items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <span className="font-semibold">Viewing as:</span>
          <ChevronRight className="h-3 w-3" />
          <span>{linkedSuppliers.find((s) => s.id === currentViewId)?.company_name}</span>
          <span className="ml-1 text-amber-600">— changes you make here apply to this supplier</span>
        </div>
      )}
    </div>
  );
}
