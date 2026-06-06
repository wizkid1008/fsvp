"use client";

import { useState, useTransition } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Edit2, Check, X } from "lucide-react";
import type { StatusTone, AppRole } from "@/types/platform";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  organization_name: string | null;
  role: AppRole;
  user_status: "active" | "pending" | "suspended";
  last_login_at: string | null;
};

const ROLES: AppRole[] = ["supplier", "us_importer", "reviewer", "administrator"];
const STATUSES = ["active", "pending", "suspended"] as const;

function roleTone(role: AppRole): StatusTone {
  if (role === "administrator") return "danger";
  if (role === "reviewer") return "info";
  if (role === "us_importer") return "success";
  return "neutral";
}

function statusTone(status: string): StatusTone {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  return "danger";
}

function roleLabel(role: AppRole) {
  if (role === "us_importer") return "US Importer";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function EditableRow({ user, onSaved }: { user: UserRow; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<AppRole>(user.role);
  const [status, setStatus] = useState(user.user_status);
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [orgName, setOrgName] = useState(user.organization_name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { error: updateError } = await (supabase.from("profiles") as any)
          .update({ role, user_status: status, full_name: fullName || null, organization_name: orgName || null })
          .eq("id", user.id);
        if (updateError) throw updateError;
        setEditing(false);
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save changes.");
      }
    });
  }

  function cancel() {
    setRole(user.role);
    setStatus(user.user_status);
    setFullName(user.full_name ?? "");
    setOrgName(user.organization_name ?? "");
    setEditing(false);
    setError(null);
  }

  const inputClass = "h-8 rounded border border-line bg-white px-2 text-sm outline-none focus:border-forest w-full";
  const selectClass = "h-8 rounded border border-line bg-white px-2 text-sm outline-none focus:border-forest";

  if (editing) {
    return (
      <>
        <tr className="bg-emerald-50">
          <td className="px-4 py-3">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className={inputClass} />
          </td>
          <td className="px-4 py-3 text-xs text-slate-500">{user.email}</td>
          <td className="px-4 py-3">
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organization" className={inputClass} />
          </td>
          <td className="px-4 py-3">
            <select value={role} onChange={(e) => setRole(e.target.value as AppRole)} className={selectClass}>
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </td>
          <td className="px-4 py-3">
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={selectClass}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </td>
          <td className="px-4 py-3 text-xs text-slate-400">—</td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-1">
              <button onClick={save} disabled={pending} className="flex h-7 w-7 items-center justify-center rounded bg-forest text-white hover:bg-[#195f4d] transition disabled:opacity-50">
                <Check className="h-3.5 w-3.5" />
              </button>
              <button onClick={cancel} className="flex h-7 w-7 items-center justify-center rounded border border-line bg-white text-slate-500 hover:bg-slate-50 transition">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </td>
        </tr>
        {error && (
          <tr className="bg-red-50">
            <td colSpan={7} className="px-4 py-2 text-xs text-red-700">{error}</td>
          </tr>
        )}
      </>
    );
  }

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3 font-medium text-ink">{user.full_name || <span className="text-slate-400 italic">No name</span>}</td>
      <td className="px-4 py-3 text-xs text-slate-500">{user.email}</td>
      <td className="px-4 py-3 text-sm text-slate-600">{user.organization_name || <span className="text-slate-400">—</span>}</td>
      <td className="px-4 py-3"><StatusBadge tone={roleTone(user.role)}>{roleLabel(user.role)}</StatusBadge></td>
      <td className="px-4 py-3"><StatusBadge tone={statusTone(user.user_status)}>{user.user_status}</StatusBadge></td>
      <td className="px-4 py-3 text-xs text-slate-400">
        {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : "Never"}
      </td>
      <td className="px-4 py-3">
        <button onClick={() => setEditing(true)} className="flex h-7 w-7 items-center justify-center rounded border border-line bg-white text-slate-500 hover:border-forest hover:text-forest transition">
          <Edit2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

export function UserManagement({ users: initial }: { users: UserRow[] }) {
  const [users, setUsers] = useState(initial);
  const [search, setSearch] = useState("");

  async function reload() {
    const supabase = createBrowserSupabaseClient();
    const { data } = await (supabase.from("profiles") as any)
      .select("id, email, full_name, organization_name, role, user_status, last_login_at")
      .order("created_at", { ascending: false });
    if (data) setUsers(data as UserRow[]);
  }

  const filtered = users.filter((u) =>
    !search ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.organization_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="rounded-lg border border-line bg-white shadow-soft overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">User Accounts ({users.length})</h3>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or org…"
          className="h-8 rounded border border-line bg-white px-3 text-sm outline-none focus:border-forest w-56"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Name</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Email</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Organization</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Role</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Status</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Last Login</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((user) => (
              <EditableRow key={user.id} user={user} onSaved={reload} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                  {search ? "No users match your search." : "No users found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
