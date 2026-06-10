"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, UserPlus } from "lucide-react";
import type { Country } from "@/types/database";
import { CountryCombobox } from "@/components/profile/CountryCombobox";

type CountryOption = Pick<Country, "country_code" | "country_name">;

// Upstream suppliers are never exporters themselves in this context —
// they supply TO the exporter. Only manufacturer/broker types belong here.
const SUPPLIER_TYPES = [
  { value: "manufacturer", label: "Manufacturer / Processor" },
  { value: "broker",       label: "Broker / Agent" },
];

export function InviteSupplierForm({
  countries,
  onClose,
}: {
  countries: CountryOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const res  = await fetch("/api/supplier-links/invite", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_name:  fd.get("company_name")?.toString().trim(),
            contact_email: fd.get("contact_email")?.toString().trim(),
            contact_name:  fd.get("contact_name")?.toString().trim(),
            country:       fd.get("country")?.toString().trim(),
            supplier_type: fd.get("supplier_type")?.toString(),
            notes:         fd.get("notes")?.toString().trim(),
          }),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Failed to add supplier.");
        setSuccess(true);
        router.refresh();
        setTimeout(onClose, 1200);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const inputClass = "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
  const labelClass = "block text-sm font-medium text-slate-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-forest" />
            <h2 className="text-lg font-semibold text-ink">Add Upstream Supplier</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 transition">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <div className="border-b border-line bg-amber-50 px-6 py-3">
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Upstream suppliers</span> manufacture or process goods that you export.
            They are <span className="font-semibold">not</span> exporters themselves — you hold the importer relationship.
            If the company is itself an exporter, link them through the Importers module instead.
          </p>
        </div>

        {success ? (
          <div className="p-6 text-center">
            <p className="text-sm font-semibold text-emerald-600">Supplier added successfully.</p>
            <p className="mt-1 text-xs text-slate-500">If you provided an email, an invite has been sent.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="p-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass + " sm:col-span-2"}>
                Company Name <span className="text-red-500">*</span>
                <input name="company_name" required className={inputClass} placeholder="Chile Farm Co." />
              </label>

              <label className={labelClass}>
                Supplier Type
                <select name="supplier_type" className={inputClass + " bg-white"}>
                  {SUPPLIER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>

              <CountryCombobox countries={countries} defaultValue="US" />
            </div>

            <div className="border-t border-line pt-4">
              <p className="mb-3 text-sm font-semibold text-slate-700">
                Primary Contact
                <span className="ml-2 text-xs font-normal text-slate-400">
                  — provide an email to send them an invite
                </span>
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  Contact Name
                  <input name="contact_name" className={inputClass} placeholder="Full name" />
                </label>
                <label className={labelClass}>
                  Contact Email
                  <input name="contact_email" type="email" className={inputClass} placeholder="email@supplier.com" />
                </label>
              </div>
            </div>

            <label className={labelClass}>
              Notes (optional)
              <textarea
                name="notes"
                rows={2}
                className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest"
                placeholder="e.g. Primary fresh produce supplier for organic line"
              />
            </label>

            {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            <div className="flex justify-end gap-3 border-t border-line pt-4">
              <button type="button" onClick={onClose}
                className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button disabled={pending}
                className="h-10 rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60">
                {pending ? "Adding…" : "Add supplier"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
