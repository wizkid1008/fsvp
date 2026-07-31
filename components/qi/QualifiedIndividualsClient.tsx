"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Mail, UserPlus, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { QUALIFICATION_BASES, QUALIFICATION_BASIS_LABEL, isActiveOn } from "@/lib/fsvp/qualified-individuals";
import type { QualificationBasis } from "@/types/database";

export type TenantMember = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  position: string | null;
};

export type QiRow = {
  id: string;
  profile_id: string;
  full_name: string | null;
  email: string;
  qualification_basis: QualificationBasis;
  education: string | null;
  training: string | null;
  experience: string | null;
  languages: string[] | null;
  scope: string[] | null;
  active_from: string;
  active_to: string | null;
  created_at: string;
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
const areaClass =
  "mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest";
const labelClass = "block text-sm font-medium text-slate-700";
const btnClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:opacity-60";

/** The credential fields, shared by both the register and invite forms. */
function CredentialFields() {
  return (
    <>
      <div>
        <label className={labelClass} htmlFor="qualification_basis">
          Qualification basis <span className="text-red-600">*</span>
        </label>
        <select id="qualification_basis" name="qualification_basis" required className={inputClass} defaultValue="combination">
          {QUALIFICATION_BASES.map((b) => (
            <option key={b} value={b}>{QUALIFICATION_BASIS_LABEL[b]}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-slate-500">
        § 1.500 defines a qualified individual by their education, training or experience. Record at
        least one — it is what an investigator reads to decide whether the signature means anything.
      </p>

      <div>
        <label className={labelClass} htmlFor="education">Education</label>
        <textarea id="education" name="education" rows={2} className={areaClass}
          placeholder="e.g. BSc Food Science, University of São Paulo, 2014" />
      </div>
      <div>
        <label className={labelClass} htmlFor="training">Training</label>
        <textarea id="training" name="training" rows={2} className={areaClass}
          placeholder="e.g. FSPCA Foreign Supplier Verification Programs course, 2023" />
      </div>
      <div>
        <label className={labelClass} htmlFor="experience">Job experience</label>
        <textarea id="experience" name="experience" rows={2} className={areaClass}
          placeholder="e.g. 8 years managing supplier approval for a produce importer" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="languages">Languages</label>
          <input id="languages" name="languages" className={inputClass} placeholder="English, Spanish" />
          <p className="mt-1 text-xs text-slate-500">
            § 1.503 requires records in a language the QI can read.
          </p>
        </div>
        <div>
          <label className={labelClass} htmlFor="scope">Scope</label>
          <input id="scope" name="scope" className={inputClass} placeholder="Produce, tree nuts" />
          <p className="mt-1 text-xs text-slate-500">Leave blank if unrestricted.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="active_from">Active from</label>
          <input id="active_from" name="active_from" type="date" className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="active_to">Active until</label>
          <input id="active_to" name="active_to" type="date" className={inputClass} />
          <p className="mt-1 text-xs text-slate-500">Blank means no end date.</p>
        </div>
      </div>
    </>
  );
}

function readCredentials(fd: FormData) {
  return {
    qualification_basis: fd.get("qualification_basis")?.toString() ?? "",
    education:           fd.get("education")?.toString().trim() ?? "",
    training:            fd.get("training")?.toString().trim() ?? "",
    experience:          fd.get("experience")?.toString().trim() ?? "",
    languages:           fd.get("languages")?.toString() ?? "",
    scope:               fd.get("scope")?.toString() ?? "",
    active_from:         fd.get("active_from")?.toString() || undefined,
    active_to:           fd.get("active_to")?.toString() || undefined,
  };
}

function Modal({
  title,
  icon: Icon,
  onClose,
  children,
}: {
  title: string;
  icon: React.ElementType;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-forest" />
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 transition hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function RegisterForm({ members, onClose }: { members: TenantMember[]; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = { profile_id: fd.get("profile_id")?.toString() ?? "", ...readCredentials(fd) };

    startTransition(async () => {
      try {
        const res = await fetch("/api/qualified-individuals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Could not register them.");
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <Modal title="Register a Qualified Individual" icon={BadgeCheck} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="profile_id">
            Person <span className="text-red-600">*</span>
          </label>
          <select id="profile_id" name="profile_id" required className={inputClass} defaultValue="">
            <option value="" disabled>Choose someone in your organization…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name ?? m.email}{m.position ? ` — ${m.position}` : ""}
              </option>
            ))}
          </select>
        </div>

        <CredentialFields />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={pending} className={btnClass}>
            {pending ? "Registering…" : "Register"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      email:     fd.get("email")?.toString().trim() ?? "",
      full_name: fd.get("full_name")?.toString().trim() ?? "",
      ...readCredentials(fd),
    };

    startTransition(async () => {
      try {
        const res = await fetch("/api/qualified-individuals/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Could not send the invitation.");
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <Modal title="Invite a Qualified Individual" icon={Mail} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          They get an account limited to your organization. They can read your records, write hazard
          analyses and verification activities, and sign attestations — but they cannot approve FSVP
          records, edit your exporters, or see any other importer&apos;s data.
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="full_name">
              Name <span className="text-red-600">*</span>
            </label>
            <input id="full_name" name="full_name" required className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="email">
              Email <span className="text-red-600">*</span>
            </label>
            <input id="email" name="email" type="email" required className={inputClass} />
          </div>
        </div>

        <CredentialFields />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose}
            className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={pending} className={btnClass}>
            {pending ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RetireButton({ qi }: { qi: QiRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function retire() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/qualified-individuals/${qi.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active_to: new Date().toISOString().slice(0, 10) }),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Could not retire them.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={retire}
        disabled={pending}
        title="Stop this person signing anything new. Everything they have already signed stays valid."
        className="text-xs font-semibold text-slate-500 underline-offset-2 transition hover:text-red-600 hover:underline disabled:opacity-60"
      >
        {pending ? "Retiring…" : "Retire"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function QualifiedIndividualsClient({
  qis,
  availableMembers,
  canManage,
  hasOrganization,
}: {
  qis: QiRow[];
  availableMembers: TenantMember[];
  canManage: boolean;
  hasOrganization: boolean;
}) {
  const [showRegister, setShowRegister] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  if (!hasOrganization) {
    return (
      <div className="mt-6 rounded-lg border border-line bg-white px-6 py-10 text-center">
        <p className="text-sm text-slate-600">
          Your account is not linked to an importing organization yet. An administrator sets that up
          when they approve your account.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {canManage && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowRegister(true)} className={btnClass}>
            <UserPlus className="h-4 w-4" />
            Register someone in your team
          </button>
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
          >
            <Mail className="h-4 w-4" />
            Invite an outside consultant
          </button>
        </div>
      )}

      {qis.length === 0 ? (
        <div className="rounded-lg border border-line bg-white px-6 py-10 text-center">
          <BadgeCheck className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-ink">No qualified individuals yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            Until someone is registered here, no FSVP record can be approved — there is nobody able
            to sign the hazard analysis, supplier evaluation or verification determination.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Basis</th>
                <th className="px-4 py-3 font-semibold">Scope</th>
                <th className="px-4 py-3 font-semibold">Active</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {qis.map((qi) => {
                const active = isActiveOn(qi);
                return (
                  <tr key={qi.id} className="border-b border-line last:border-0 align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{qi.full_name ?? qi.email}</p>
                      <p className="text-xs text-slate-500">{qi.email}</p>
                      {qi.languages && qi.languages.length > 0 && (
                        <p className="mt-1 text-xs text-slate-500">Reads: {qi.languages.join(", ")}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {QUALIFICATION_BASIS_LABEL[qi.qualification_basis]}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {qi.scope && qi.scope.length > 0 ? qi.scope.join(", ") : "Unrestricted"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(qi.active_from).toLocaleDateString()} —{" "}
                      {qi.active_to ? new Date(qi.active_to).toLocaleDateString() : "open"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={active ? "success" : "neutral"}>
                        {active ? "Active" : "Retired"}
                      </StatusBadge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">{active && <RetireButton qi={qi} />}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showRegister && (
        <RegisterForm members={availableMembers} onClose={() => setShowRegister(false)} />
      )}
      {showInvite && <InviteForm onClose={() => setShowInvite(false)} />}
    </div>
  );
}
