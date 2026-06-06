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
    window.location.reload();
  }

  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex items-center gap-2 mb-4">
        <Eye className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-ink">View Site As Role</h3>
        {current && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            Previewing as {ROLES.find((r) => r.value === current)?.label}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Preview how the platform looks and behaves for each role. This only affects your view — your actual role and data access remain unchanged.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ROLES.map((role) => {
          const active = (current ?? "administrator") === role.value;
          return (
            <button
              key={role.value}
              onClick={() => select(role.value)}
              className={`flex flex-col items-start rounded-lg border p-3 text-left transition ${
                active
                  ? "border-forest bg-emerald-50"
                  : "border-line bg-white hover:border-forest hover:bg-slate-50"
              }`}
            >
              <span className={`text-sm font-semibold ${active ? "text-forest" : "text-ink"}`}>
                {role.label}
                {active && <span className="ml-2 text-xs font-normal text-forest">(active)</span>}
              </span>
              <span className="mt-0.5 text-xs text-slate-500">{role.description}</span>
            </button>
          );
        })}
      </div>
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
