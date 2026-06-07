"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { X } from "lucide-react";
import { CountryCombobox } from "@/components/profile/CountryCombobox";
import type { Country } from "@/types/database";

type CountryOption = Pick<Country, "country_code" | "country_name">;

function normalizeWebsite(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withScheme).toString();
  } catch {
    throw new Error("Enter a valid website domain, such as nubiancheese.com.");
  }
}

export function AddSupplierForm({ countries, onClose }: { countries: CountryOption[]; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient();

        const contactName = formData.get("contact_name")?.toString().trim() || null;
        const contactEmail = formData.get("contact_email")?.toString().trim() || null;
        const country = formData.get("country")?.toString().trim() ?? "";
        const website = normalizeWebsite(formData.get("website")?.toString() ?? "");

        if (!countries.some((option) => option.country_name.toLowerCase() === country.toLowerCase())) {
          setError("Select a country from the dropdown list.");
          return;
        }

        const { error: insertError } = await (supabase.from("suppliers") as any).insert({
          company_name: formData.get("company_name")?.toString().trim() ?? "",
          legal_entity_name: formData.get("legal_entity_name")?.toString().trim() || null,
          country,
          fda_registration_number: formData.get("fda_registration_number")?.toString().trim() || null,
          website,
          contact_json: contactName || contactEmail ? { name: contactName, email: contactEmail } : {},
          address_json: {},
          approval_status: "pending_review",
          certification_status: "pending_review",
        });

        if (insertError) throw insertError;
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save supplier.");
      }
    });
  }

  const inputClass = "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
  const labelClass = "block text-sm font-medium text-slate-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold text-ink">Add Supplier</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 transition">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Company Name <span className="text-red-500">*</span>
              <input name="company_name" required className={inputClass} placeholder="Pacific Valley Foods Ltd." />
            </label>
            <label className={labelClass}>
              Legal Entity Name
              <input name="legal_entity_name" className={inputClass} placeholder="Legal name if different" />
            </label>
            <CountryCombobox countries={countries} required />
            <label className={labelClass}>
              FDA Registration #
              <input name="fda_registration_number" className={inputClass} placeholder="Optional" />
            </label>
            <label className={labelClass}>
              Website
              <input name="website" type="text" inputMode="url" className={inputClass} placeholder="nubiancheese.com" />
            </label>
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-3 text-sm font-semibold text-slate-700">Primary Contact</p>
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

          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button
              disabled={pending}
              className="h-10 rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60"
            >
              {pending ? "Saving…" : "Add supplier"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
