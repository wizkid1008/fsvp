"use client";

import { useState, useTransition } from "react";
import type { AppRole } from "@/types/platform";

const ROLES: Array<{ value: AppRole; label: string }> = [
  { value: "supplier", label: "Foreign Supplier" },
  { value: "us_importer", label: "US Importer" },
  { value: "reviewer", label: "Reviewer" },
  { value: "administrator", label: "Administrator" }
];

export function InviteUserButton() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [role, setRole] = useState<AppRole>("supplier");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setMessage(null);
    setError(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/invite-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, fullName, organizationName, role })
        });
        const result = (await response.json().catch(() => ({}))) as { error?: string; email?: string };

        if (!response.ok) {
          throw new Error(result.error ?? "Could not send invitation.");
        }

        setMessage(`Invitation sent to ${result.email ?? email.trim()}.`);
        setEmail("");
        setFullName("");
        setOrganizationName("");
        setRole("supplier");
        window.setTimeout(() => window.location.reload(), 900);
      } catch (inviteError) {
        setError(inviteError instanceof Error ? inviteError.message : "Could not send invitation.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center justify-center rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
      >
        Invite User
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
          <button className="absolute inset-0 cursor-default" type="button" aria-label="Close invite dialog" onClick={close} />
          <form onSubmit={submit} className="relative w-full max-w-lg rounded-lg border border-line bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">Invite user</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Send a Supabase invite email and create a pending profile for the selected role.
                </p>
              </div>
              <button type="button" onClick={close} className="text-sm font-bold text-slate-500 hover:text-black">
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="block text-sm font-semibold text-ink">
                Email
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  required
                  className="mt-2 h-11 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-forest"
                  placeholder="person@example.com"
                />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Full name
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-2 h-11 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-forest"
                  placeholder="Optional"
                />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Organization
                <input
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  className="mt-2 h-11 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-forest"
                  placeholder="Optional"
                />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Role
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as AppRole)}
                  className="mt-2 h-11 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
                >
                  {ROLES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {message ? <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={close} disabled={pending} className="h-10 rounded-md border border-line px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                Cancel
              </button>
              <button type="submit" disabled={pending} className="h-10 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-[#195f4d] disabled:opacity-60">
                {pending ? "Sending..." : "Send invite"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
