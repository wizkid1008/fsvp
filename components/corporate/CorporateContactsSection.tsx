"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface ContactJson {
  primary_name?:     string;
  primary_title?:    string;
  primary_phone?:    string;
  primary_email?:    string;
  regulatory_name?:  string;
  regulatory_title?: string;
  regulatory_phone?: string;
  regulatory_email?: string;
  // legacy keys
  name?:  string;
  email?: string;
}

function isContactComplete(c: ContactJson, key: "primary" | "regulatory") {
  if (key === "primary")    return !!(c.primary_name    && c.primary_email);
  if (key === "regulatory") return !!(c.regulatory_name && c.regulatory_email);
  return false;
}

function ContactFields({
  prefix,
  label,
  defaults,
  isCritical,
}: {
  prefix:     "primary" | "regulatory";
  label:      string;
  defaults:   ContactJson;
  isCritical: boolean;
}) {
  const nameKey  = `${prefix}_name`  as keyof ContactJson;
  const titleKey = `${prefix}_title` as keyof ContactJson;
  const phoneKey = `${prefix}_phone` as keyof ContactJson;
  const emailKey = `${prefix}_email` as keyof ContactJson;

  const complete = isContactComplete(defaults, prefix);

  return (
    <div className="border-t border-line first:border-t-0">
      <div className="flex items-start gap-3 px-5 py-3">
        <div className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-ink">{label}</p>
            {complete
              ? <StatusBadge tone="success">Complete</StatusBadge>
              : isCritical && <span className="text-xs font-semibold text-red-600">Critical blocker</span>
            }
          </div>
        </div>
        {complete && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}
        {!complete && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
      </div>

      <div className="mx-5 mb-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-700">
          Full Name <span className="text-red-500">*</span>
          <input
            name={nameKey}
            defaultValue={defaults[nameKey] ?? ""}
            placeholder="e.g. Maria Santos"
            className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm font-normal outline-none focus:border-forest"
          />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Title / Role
          <input
            name={titleKey}
            defaultValue={defaults[titleKey] ?? ""}
            placeholder="e.g. Food Safety Manager"
            className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm font-normal outline-none focus:border-forest"
          />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Email <span className="text-red-500">*</span>
          <input
            type="email"
            name={emailKey}
            defaultValue={defaults[emailKey] ?? ""}
            placeholder="contact@company.com"
            className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm font-normal outline-none focus:border-forest"
          />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Phone
          <input
            name={phoneKey}
            defaultValue={defaults[phoneKey] ?? ""}
            placeholder="+1 555 000 0000"
            className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm font-normal outline-none focus:border-forest"
          />
        </label>
      </div>
    </div>
  );
}

export function CorporateContactsSection({
  contactJson,
}: {
  contactJson: ContactJson;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const primaryComplete    = isContactComplete(contactJson, "primary");
  const regulatoryComplete = isContactComplete(contactJson, "regulatory");
  const acceptedCount      = [primaryComplete, regulatoryComplete].filter(Boolean).length;
  const hasCritical        = !primaryComplete;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries()) as Record<string, string>;

    startTransition(async () => {
      try {
        const res  = await fetch("/api/suppliers/contacts", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Save failed.");
        setMessage("Contacts saved.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  return (
    <div>
      {/* Section header */}
      <div className="flex items-start gap-4 px-5 py-4">
        {acceptedCount === 2
          ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          : <AlertCircle  className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
        }
        <div className="flex-1">
          <p className="text-sm font-semibold text-ink">Primary Contacts</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            Identify key contacts for food safety, quality, and regulatory correspondence.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {acceptedCount} of 2 complete
            {hasCritical && (
              <span className="ml-2 font-semibold text-red-600">· Critical blocker</span>
            )}
          </p>
        </div>
        {acceptedCount === 2 && <StatusBadge tone="success">Complete</StatusBadge>}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mx-5 mb-4 overflow-hidden rounded-md border border-line bg-white">
          <ContactFields
            prefix="primary"
            label="Primary Contact Information"
            defaults={contactJson}
            isCritical
          />
          <ContactFields
            prefix="regulatory"
            label="Regulatory / Quality Contact"
            defaults={contactJson}
            isCritical={false}
          />
        </div>

        {message && (
          <p className="mx-5 mb-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</p>
        )}
        {error && (
          <p className="mx-5 mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <div className="flex justify-end px-5 pb-4">
          <button
            disabled={pending}
            className="h-9 rounded-md bg-forest px-5 text-sm font-semibold text-white hover:bg-[#195f4d] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save contacts"}
          </button>
        </div>
      </form>
    </div>
  );
}
