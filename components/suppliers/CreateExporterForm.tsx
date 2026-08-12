"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Building2, AlertTriangle } from "lucide-react";
import { CountryCombobox } from "@/components/profile/CountryCombobox";
import type { Country } from "@/types/database";

type CountryOption = Pick<Country, "country_code" | "country_name">;

// validate_exporter_link() rejects any importer link whose target is not
// export-eligible, so a pure manufacturer or broker cannot appear here — they
// have to flow through an exporter.
const EXPORTER_TYPES = [
  { value: "exporter",              label: "Exporter" },
  { value: "exporter_manufacturer", label: "Exporter & Manufacturer" },
  { value: "trader",                label: "Trader / Agent" },
];

export type EditableExporter = {
  id: string;
  company_name: string;
  legal_entity_name: string | null;
  country: string;
  website: string | null;
  fda_registration_number: string | null;
  duns_number?: string | null;
  supplier_type?: string | null;
  contact_json: Record<string, string> | null;
  record_mode?: string | null;
};

function displayWebsite(value: string | null) {
  if (!value) return "";
  return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function CreateExporterForm({
  countries,
  onClose,
  exporter = null,
}: {
  countries: CountryOption[];
  onClose: () => void;
  exporter?: EditableExporter | null;
}) {
  const router = useRouter();
  const isEditing = Boolean(exporter);
  const [invite, setInvite] = useState(!isEditing);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setHint(null);
    const fd = new FormData(e.currentTarget);

    const country = fd.get("country")?.toString().trim() ?? "";
    if (!countries.some((c) => c.country_name.toLowerCase() === country.toLowerCase())) {
      setError("Select a country from the dropdown list.");
      return;
    }

    const payload: Record<string, string> = {
      company_name:            fd.get("company_name")?.toString().trim() ?? "",
      legal_entity_name:       fd.get("legal_entity_name")?.toString().trim() ?? "",
      country,
      supplier_type:           fd.get("supplier_type")?.toString() ?? "exporter",
      fda_registration_number: fd.get("fda_registration_number")?.toString().trim() ?? "",
      duns_number:             fd.get("duns_number")?.toString().trim() ?? "",
      website:                 fd.get("website")?.toString().trim() ?? "",
      contact_name:            fd.get("contact_name")?.toString().trim() ?? "",
      contact_email:           invite ? (fd.get("contact_email")?.toString().trim() ?? "") : "",
    };

    startTransition(async () => {
      try {
        const res = await fetch(
          isEditing ? `/api/exporters/${exporter!.id}` : "/api/exporters/create",
          {
            method:  isEditing ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(isEditing ? payload : { ...payload, notes: fd.get("notes")?.toString().trim() }),
          }
        );
        const json = await res.json() as { error?: string; action?: string };

        if (!res.ok || json.error) {
          if (json.action === "link_instead") {
            setHint("Close this and use “Link an exporter” instead — they are already registered.");
          }
          throw new Error(json.error ?? "Could not save the exporter.");
        }

        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const inputClass = "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
  const labelClass = "block text-sm font-medium text-slate-700";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-forest" />
            <h2 className="text-lg font-semibold text-ink">
              {isEditing ? "Edit Exporter Record" : "Add an Exporter"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded p-1 transition hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {!isEditing && (
          <div className="border-b border-line bg-amber-50 px-6 py-3">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs leading-5 text-amber-900">
                Use this for exporters who will not register themselves. You will own this record,
                and <span className="font-semibold">you will be responsible for uploading and
                attesting to their evidence</span>. Evidence you upload is recorded as
                importer-provided rather than supplier-attested, and appears that way in your
                inspection package. If they are already on the platform, use{" "}
                <span className="font-semibold">Link an exporter</span> instead.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass + " sm:col-span-2"}>
              Company Name <span className="text-red-500">*</span>
              <input
                name="company_name"
                required
                defaultValue={exporter?.company_name ?? ""}
                className={inputClass}
                placeholder="Andes Ingredients S.A."
              />
            </label>

            <label className={labelClass}>
              Legal Entity Name
              <input
                name="legal_entity_name"
                defaultValue={exporter?.legal_entity_name ?? ""}
                className={inputClass}
                placeholder="If different"
              />
            </label>

            <label className={labelClass}>
              Type
              <select
                name="supplier_type"
                defaultValue={exporter?.supplier_type ?? "exporter"}
                className={inputClass + " bg-white"}
              >
                {EXPORTER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                Only export-eligible types can ship directly to a U.S. importer.
              </span>
            </label>

            <CountryCombobox countries={countries} defaultValue={exporter?.country ?? ""} required />

            <label className={labelClass}>
              FDA Registration #
              <input
                name="fda_registration_number"
                defaultValue={exporter?.fda_registration_number ?? ""}
                className={inputClass}
                placeholder="Optional"
              />
            </label>

            <label className={labelClass}>
              DUNS Number
              <input
                name="duns_number"
                defaultValue={exporter?.duns_number ?? ""}
                className={inputClass}
                placeholder="Optional"
              />
            </label>

            <label className={labelClass}>
              Website
              <input
                name="website"
                type="text"
                inputMode="url"
                defaultValue={displayWebsite(exporter?.website ?? null)}
                className={inputClass}
                placeholder="andesing.pe"
              />
            </label>
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-3 text-sm font-semibold text-slate-700">Primary Contact</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Contact Name
                <input
                  name="contact_name"
                  defaultValue={exporter?.contact_json?.name ?? ""}
                  className={inputClass}
                  placeholder="Full name"
                />
              </label>
              <label className={labelClass}>
                Contact Email
                <input
                  name="contact_email"
                  type="email"
                  defaultValue={exporter?.contact_json?.email ?? ""}
                  className={inputClass}
                  placeholder="email@exporter.com"
                />
              </label>
            </div>
          </div>

          {!isEditing && (
            <>
              <div className="rounded-md border border-line bg-slate-50 p-3">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={invite}
                    onChange={(e) => setInvite(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-700">
                      Invite them to claim this record
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                      Sends the contact email an invitation. If they accept, they take over their
                      own company profile and upload evidence directly — you keep the relationship
                      and everything already uploaded. If you skip this, the record stays yours to
                      maintain.
                    </span>
                  </span>
                </label>
              </div>

              <label className={labelClass}>
                Notes (optional)
                <textarea
                  name="notes"
                  rows={2}
                  className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest"
                  placeholder="e.g. Primary quinoa supplier, contact via WhatsApp"
                />
              </label>
            </>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
              {hint && <p className="mt-1 text-xs text-red-600">{hint}</p>}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              disabled={pending}
              className="h-10 rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60"
            >
              {pending ? "Saving…" : isEditing ? "Save changes" : "Add exporter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
