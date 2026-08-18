"use client";

import { useState, useEffect, useMemo } from "react";
import { Eye, X, ArrowLeft, Search } from "lucide-react";
import type { AppRole } from "@/types/platform";
import { PREVIEW_ROLE_COOKIE, PREVIEW_SUPPLIER_ID_COOKIE, PREVIEW_SUPPLIER_NAME_COOKIE } from "@/lib/preview-role-constants";

function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=31536000;samesite=lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=;path=/;max-age=0;samesite=lax`;
}

function clearAllPreviewCookies() {
  clearCookie(PREVIEW_ROLE_COOKIE);
  clearCookie(PREVIEW_SUPPLIER_ID_COOKIE);
  clearCookie(PREVIEW_SUPPLIER_NAME_COOKIE);
}

const ROLES: { value: AppRole; label: string; description: string }[] = [
  { value: "administrator", label: "Administrator", description: "Full platform access, admin panel, all pages" },
  { value: "us_importer",   label: "US Importer",   description: "Supplier management, evidence, readiness, reports" },
  { value: "reviewer",      label: "Reviewer",       description: "Review queue, evidence, supplier profiles, audit log" },
  { value: "exporter",      label: "Exporter",       description: "Company Overview, My Suppliers, Facilities, Products, Evidence" },
  { value: "supplier",      label: "Supplier",        description: "Company Overview, Facilities, Products, My Evidence (own data only)" },
];

// Roles where the dashboard is scoped to a specific account's data —
// previewing these lets the admin pick which real account to view as.
const ACCOUNT_SCOPED_ROLES = new Set<AppRole>(["supplier", "exporter", "us_importer"]);

type Account = {
  id: string;
  company_name: string | null;
  detail?: string | null;
  duplicate_count?: number | null;
};

export function RolePreviewSelector() {
  const [current, setCurrent] = useState<AppRole | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<AppRole | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");

  useEffect(() => {
    setCurrent(readCookie(PREVIEW_ROLE_COOKIE) as AppRole | null);
    setAccountName(readCookie(PREVIEW_SUPPLIER_NAME_COOKIE));
  }, []);

  function apply(role: AppRole, account?: Account | null) {
    if (role === "administrator") {
      clearAllPreviewCookies();
    } else {
      writeCookie(PREVIEW_ROLE_COOKIE, role);
      if (account) {
        writeCookie(PREVIEW_SUPPLIER_ID_COOKIE, account.id);
        writeCookie(PREVIEW_SUPPLIER_NAME_COOKIE, account.company_name ?? "");
      } else {
        clearCookie(PREVIEW_SUPPLIER_ID_COOKIE);
        clearCookie(PREVIEW_SUPPLIER_NAME_COOKIE);
      }
    }
    setOpen(false);
    setPendingRole(null);
    window.location.reload();
  }

  async function selectRole(role: AppRole) {
    if (!ACCOUNT_SCOPED_ROLES.has(role)) {
      apply(role);
      return;
    }
    // Supplier/exporter dashboards are scoped to one account's data —
    // let the admin pick a specific real account before applying.
    setPendingRole(role);
    setAccountSearch("");
    setLoadingAccounts(true);
    try {
      const res = await fetch(`/api/admin/preview-accounts?role=${role}`);
      const json = await res.json();
      setAccounts(res.ok ? (json.accounts ?? []) : []);
    } catch {
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }

  const activeRole = ROLES.find((r) => r.value === (current ?? "administrator"));

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((acc) => (acc.company_name ?? "").toLowerCase().includes(q));
  }, [accounts, accountSearch]);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-white px-4 py-3 shadow-soft">
      <Eye className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="text-sm font-medium text-slate-600">View site as:</span>

      <div className="relative">
        <button
          onClick={() => { setOpen((o) => !o); setPendingRole(null); }}
          className="flex items-center gap-2 rounded-md border border-line bg-slate-50 px-3 py-1.5 text-sm font-semibold text-ink hover:border-forest transition"
        >
          {activeRole?.label}
          {accountName && <span className="font-normal text-slate-500">— {accountName}</span>}
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
            <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setPendingRole(null); }} />
            <div className="absolute left-0 top-full z-50 mt-1 w-96 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-white shadow-xl overflow-hidden">
              {pendingRole ? (
                <>
                  <button
                    onClick={() => setPendingRole(null)}
                    className="flex w-full items-center gap-2 border-b border-line px-4 py-2.5 text-left text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to roles
                  </button>
                  <button
                    onClick={() => apply(pendingRole, null)}
                    className="w-full px-4 py-3 text-left hover:bg-slate-50 transition"
                  >
                    <p className="text-sm font-semibold text-ink">Generic {ROLES.find((r) => r.value === pendingRole)?.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">Empty-state dashboard, not tied to a real account</p>
                  </button>
                  <div className="border-t border-line px-3 py-2">
                    <div className="flex items-center gap-2 rounded-md border border-line bg-slate-50 px-2.5 py-1.5">
                      <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <input
                        autoFocus
                        value={accountSearch}
                        onChange={(e) => setAccountSearch(e.target.value)}
                        placeholder="Search accounts…"
                        className="w-full bg-transparent text-sm text-ink placeholder:text-slate-400 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto border-t border-line">
                    {loadingAccounts && (
                      <p className="px-4 py-3 text-xs text-slate-400">Loading accounts…</p>
                    )}
                    {!loadingAccounts && accounts.length === 0 && (
                      <p className="px-4 py-3 text-xs text-slate-400">No {pendingRole} accounts found.</p>
                    )}
                    {!loadingAccounts && accounts.length > 0 && filteredAccounts.length === 0 && (
                      <p className="px-4 py-3 text-xs text-slate-400">No accounts match "{accountSearch}".</p>
                    )}
                    {filteredAccounts.map((acc) => (
                      <button
                        key={acc.id}
                        onClick={() => apply(pendingRole, acc)}
                        className="w-full px-4 py-2.5 text-left hover:bg-slate-50 transition"
                      >
                        <span className="block truncate text-sm font-medium text-ink">
                          {acc.company_name ?? "Unnamed account"}
                        </span>
                        {acc.detail && (
                          <span className={`mt-0.5 block truncate text-xs ${acc.duplicate_count && acc.duplicate_count > 1 ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                            {acc.detail}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                ROLES.map((role) => {
                  const active = (current ?? "administrator") === role.value;
                  return (
                    <button
                      key={role.value}
                      onClick={() => selectRole(role.value)}
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
                })
              )}
            </div>
          </>
        )}
      </div>

      {current && (
        <button
          onClick={() => apply("administrator")}
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
  const [accountName, setAccountName] = useState<string | null>(null);

  useEffect(() => {
    setPreviewRole(readCookie(PREVIEW_ROLE_COOKIE) as AppRole | null);
    setAccountName(readCookie(PREVIEW_SUPPLIER_NAME_COOKIE));
  }, []);

  if (!previewRole) return null;

  const label = ROLES.find((r) => r.value === previewRole)?.label ?? previewRole;

  function reset() {
    clearAllPreviewCookies();
    window.location.reload();
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm font-semibold text-amber-950">
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        Previewing as: {label}
        {accountName && <span className="font-normal">— {accountName}</span>}
      </span>
      <button onClick={reset} className="flex items-center gap-1 rounded px-2 py-1 hover:bg-amber-500 transition text-xs">
        <X className="h-3 w-3" /> Exit Preview
      </button>
    </div>
  );
}
