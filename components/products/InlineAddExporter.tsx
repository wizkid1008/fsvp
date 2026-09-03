"use client";

import { useState, useTransition } from "react";
import { CountryCombobox } from "@/components/profile/CountryCombobox";

/**
 * Add an exporter without leaving the product you're creating.
 *
 * /api/exporters/create only requires a company name and a country — contact
 * details are optional, and it exists specifically for the exporter who will
 * never register on the platform themselves (21 CFR 1.502 still makes the
 * importer responsible for their evidence either way).
 *
 * That route also does its own find-or-create: if a matching company already
 * exists it refuses with 409 and hands back the existing supplier's id rather
 * than creating a shadow copy. Rather than surface that as a plain error and
 * leave a person to go find and pick the right one manually, this offers to
 * use the match directly — it is very likely the same company they meant.
 */
export function InlineAddExporter({
  countries,
  onCreated,
  onCancel,
}: {
  countries: Array<{ country_code: string; country_name: string }>;
  onCreated: (exporter: { id: string; company_name: string }) => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: string; name: string } | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setExisting(null);
    const formData = new FormData(event.currentTarget);

    const company_name = formData.get("company_name")?.toString().trim() ?? "";
    const country = formData.get("country")?.toString().trim() ?? "";

    if (!company_name) return setError("Name the exporter.");
    if (!country) return setError("Choose the exporter's country.");

    startTransition(async () => {
      try {
        const res = await fetch("/api/exporters/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_name, country }),
        });
        const json = await res.json().catch(() => ({})) as {
          supplier_id?: string;
          existing_supplier_id?: string;
          error?: string;
        };

        if (res.status === 409 && json.existing_supplier_id) {
          setExisting({ id: json.existing_supplier_id, name: company_name });
          return;
        }
        if (!res.ok || !json.supplier_id) throw new Error(json.error ?? "Could not add the exporter.");
        onCreated({ id: json.supplier_id, company_name });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add the exporter.");
      }
    });
  }

  const inputClass = "mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
  const labelClass = "block text-xs font-medium text-slate-600";

  if (existing) {
    return (
      <div className="mt-2 space-y-2.5 rounded-md border border-forest/30 bg-emerald-50/40 p-3">
        <p className="text-xs leading-5 text-ink">
          {existing.name} is already on the platform. Use that record instead of creating a
          duplicate.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onCreated({ id: existing.id, company_name: existing.name })}
            className="inline-flex h-8 items-center rounded-md bg-forest px-3 text-xs font-semibold text-white transition hover:bg-[#195f4d]"
          >
            Use this exporter
          </button>
          <button
            type="button"
            onClick={() => setExisting(null)}
            className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Try a different name
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2.5 rounded-md border border-forest/30 bg-emerald-50/40 p-3">
      <p className="text-xs font-semibold text-ink">New exporter</p>
      <label className={labelClass}>
        Company name
        <input name="company_name" required autoFocus className={inputClass} placeholder="Andes Ingredients" />
      </label>
      <CountryCombobox countries={countries} required />
      <p className="text-[11px] leading-4 text-slate-500">
        Contact details can be added later from the exporter's own page.
      </p>
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-8 items-center rounded-md bg-forest px-3 text-xs font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add exporter"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
