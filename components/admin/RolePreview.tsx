"use client";

import { useState, useEffect } from "react";
import { Eye, X } from "lucide-react";
import type { AppRole } from "@/types/platform";

const PREVIEW_KEY = "fsvp_preview_role";

const ROLES: { value: AppRole; label: string; description: string }[] = [
  { value: "administrator", label: "Administrator", description: "Full platform access, admin panel, all pages" },
  { value: "us_importer", label: "US Importer", description: "Supplier management, evidence, readiness, reports" },
  { value: "reviewer", label: "Reviewer", description: "Review queue, evidence, supplier profiles, audit log" },
  { value: "supplier", label: "Foreign Supplier", description: "My Evidence, My Requests only" },
];

export function RolePreviewSelector() {
  const [current, setCurrent] = useState<AppRole | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(PREVIEW_KEY) as AppRole | null;
    setCurrent(stored);
  }, []);

  function select(role: AppRole) {
    if (role === "administrator") {
      localStorage.removeItem(PREVIEW_KEY);
      setCurrent(null);
    } else {
      localStorage.setItem(PREVIEW_KEY, role);
      setCurrent(role);
    }
    setOpen(false);
    window.location.reload();
  }

  const activeRole = ROLES.find((r) => r.value === (current ?? "administrator"));

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 shadow-soft">
      <Eye className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="text-sm font-medium text-slate-600">View site as:</span>

      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-md border border-line bg-slate-50 px-3 py-1.5 text-sm font-semibold text-ink hover:border-forest transition"
        >
          {activeRole?.label}
          {current && (
            <span className="rounded-full bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
              preview
            </span>
          )}
          <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-line bg-white shadow-xl overflow-hidden">
              {ROLES.map((role) => {
                const active = (current ?? "administrator") === role.value;
                return (
                  <button
                    key={role.value}
                    onClick={() => select(role.value)}
                    className={`w-full px-4 py-3 text-left transition ${
                      active ? "bg-emerald-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${active ? "text-forest" : "text-ink"}`}>
                      {role.label}
                      {active && <span className="ml-2 text-xs font-normal text-forest">(active)</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{role.description}</p>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {current && (
        <button
          onClick={() => select("administrator")}
          className="ml-auto flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600 transition"
        >
          <X className="h-3.5 w-3.5" /> Exit preview
        </button>
      )}
    </div>
  );
}

export function RolePreviewBanner() {
  const [previewRole, setPreviewRole] = useState<AppRole | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(PREVIEW_KEY) as AppRole | null;
    setPreviewRole(stored);
  }, []);

  if (!previewRole) return null;

  const label = ROLES.find((r) => r.value === previewRole)?.label ?? previewRole;

  function reset() {
    localStorage.removeItem(PREVIEW_KEY);
    window.location.reload();
  }

  return (
    <div className="sticky top-[72px] z-40 flex items-center justify-between gap-3 bg-amber-400 px-5 py-2 text-sm font-semibold text-amber-950">
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        Previewing as: {label}
      </span>
      <button onClick={reset} className="flex items-center gap-1 rounded px-2 py-1 hover:bg-amber-500 transition text-xs">
        <X className="h-3 w-3" /> Exit Preview
      </button>
    </div>
  );
}
