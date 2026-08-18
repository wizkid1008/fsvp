"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Building2 } from "lucide-react";
import { normalizeImporterName } from "@/lib/importers/names";

type ExistingImporter = {
  id: string;
  company_name: string | null;
  legal_name: string | null;
  primary_contact_email?: string | null;
  detail?: string | null;
  duplicate_count?: number | null;
};

export function ApproveImporterModal({
  profileId,
  email,
  suggestedName,
  onClose,
}: {
  profileId: string;
  email: string;
  suggestedName: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [existing, setExisting] = useState<ExistingImporter[]>([]);
  const [attachTo, setAttachTo] = useState("");
  const [legalName, setLegalName] = useState(suggestedName ?? "");
  const [displayName, setDisplayName] = useState("");
  const [allowDuplicateName, setAllowDuplicateName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/preview-accounts?role=us_importer");
      const json = await res.json().catch(() => ({})) as { accounts?: ExistingImporter[] };
      if (res.ok) setExisting(json.accounts ?? []);
    })();
  }, []);

  useEffect(() => {
    setLegalName(suggestedName ?? "");
    setDisplayName("");
    setAllowDuplicateName(false);
  }, [suggestedName]);

  const duplicateMatches = useMemo(() => {
    const requestedLegalName = normalizeImporterName(legalName);
    const requestedDisplayName = normalizeImporterName(displayName || legalName);
    if (!requestedLegalName && !requestedDisplayName) return [];

    return existing.filter((importer) => {
      const existingDisplayName = normalizeImporterName(importer.company_name);
      const existingLegalName = normalizeImporterName(importer.legal_name);
      return Boolean(
        (requestedDisplayName && requestedDisplayName === existingDisplayName) ||
        (requestedLegalName && requestedLegalName === existingLegalName)
      );
    });
  }, [displayName, existing, legalName]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const payload =
          mode === "existing"
            ? { profile_id: profileId, attach_to_importer_id: attachTo }
            : {
                profile_id:   profileId,
                legal_name:   legalName.trim(),
                display_name: displayName.trim(),
                ein:          fd.get("ein")?.toString().trim(),
                duns_number:  fd.get("duns_number")?.toString().trim(),
                food_scope:   fd.get("food_scope")?.toString(),
                allow_duplicate_name: allowDuplicateName,
                address_json: {
                  street:  fd.get("street")?.toString().trim() || undefined,
                  city:    fd.get("city")?.toString().trim() || undefined,
                  state:   fd.get("state")?.toString().trim() || undefined,
                  zip:     fd.get("zip")?.toString().trim() || undefined,
                  country: "US",
                },
              };

        const res  = await fetch("/api/admin/approve-importer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Approval failed.");

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
            <h2 className="text-lg font-semibold text-ink">Approve Importer Account</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 transition">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="border-b border-line bg-slate-50 px-6 py-3">
          <p className="text-xs text-slate-600">
            Approving <span className="font-semibold">{email}</span>. Every importer needs its own
            organization — this is what separates their FSVP records, evidence, and reports from
            every other importer on the platform.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6">
          <div className="flex gap-2">
            {([
              { value: "new" as const,      label: "Create a new organization" },
              { value: "existing" as const, label: "Add to an existing one" },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={`flex-1 rounded-md border px-3 py-2 text-xs font-semibold transition ${
                  mode === opt.value
                    ? "border-forest bg-forest/5 text-forest"
                    : "border-line bg-white text-slate-500 hover:border-slate-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {mode === "existing" ? (
            <label className={labelClass}>
              Organization <span className="text-red-500">*</span>
              <select
                value={attachTo}
                onChange={(e) => setAttachTo(e.target.value)}
                required
                className={inputClass + " bg-white"}
              >
                <option value="">Select an organization…</option>
                {existing.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.company_name ?? "Unnamed organization"} — {i.legal_name ?? "No legal name"}
                    {i.primary_contact_email ? ` — ${i.primary_contact_email}` : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                Use this when the person is joining a company already on the platform. They will
                see everything that organization owns.
              </span>
            </label>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass + " sm:col-span-2"}>
                  Legal Entity Name <span className="text-red-500">*</span>
                  <input
                    name="legal_name"
                    required
                    value={legalName}
                    onChange={(event) => {
                      setLegalName(event.target.value);
                      setAllowDuplicateName(false);
                    }}
                    className={inputClass}
                    placeholder="GreenPath Foods LLC"
                  />
                </label>

                <label className={labelClass}>
                  Display Name
                  <input
                    name="display_name"
                    value={displayName}
                    onChange={(event) => {
                      setDisplayName(event.target.value);
                      setAllowDuplicateName(false);
                    }}
                    className={inputClass}
                    placeholder="Defaults to legal name"
                  />
                </label>

                <label className={labelClass}>
                  Food Scope
                  <select name="food_scope" defaultValue="human" className={inputClass + " bg-white"}>
                    <option value="human">Human food</option>
                    <option value="animal">Animal food</option>
                    <option value="both">Both</option>
                  </select>
                </label>

                <label className={labelClass}>
                  EIN
                  <input name="ein" className={inputClass} placeholder="84-1122334" />
                </label>

                <label className={labelClass}>
                  DUNS Number
                  <input name="duns_number" className={inputClass} placeholder="9 digits" />
                  <span className="mt-1 block text-xs text-slate-500">
                    Transmitted as the FSVP importer identifier at entry (§ 1.509).
                  </span>
                </label>
              </div>

              {duplicateMatches.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-900">
                    This name already exists.
                  </p>
                  <div className="mt-2 space-y-2">
                    {duplicateMatches.slice(0, 3).map((importer) => (
                      <button
                        key={importer.id}
                        type="button"
                        onClick={() => {
                          setMode("existing");
                          setAttachTo(importer.id);
                          setAllowDuplicateName(false);
                        }}
                        className="block w-full rounded border border-amber-200 bg-white px-3 py-2 text-left text-xs text-amber-950 transition hover:border-amber-400"
                      >
                        <span className="block font-semibold">
                          {importer.company_name ?? "Unnamed organization"}
                        </span>
                        {importer.detail && <span className="mt-0.5 block text-amber-800">{importer.detail}</span>}
                      </button>
                    ))}
                  </div>
                  <label className="mt-3 flex items-start gap-2 text-xs font-medium text-amber-950">
                    <input
                      type="checkbox"
                      checked={allowDuplicateName}
                      onChange={(event) => setAllowDuplicateName(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-amber-300 text-forest focus:ring-forest"
                    />
                    Create a separate importer organization anyway.
                  </label>
                </div>
              )}

              <div className="border-t border-line pt-4">
                <p className="mb-3 text-sm font-semibold text-slate-700">U.S. Address</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelClass + " sm:col-span-2"}>
                    Street
                    <input name="street" className={inputClass} placeholder="100 Import Lane" />
                  </label>
                  <label className={labelClass}>
                    City
                    <input name="city" className={inputClass} />
                  </label>
                  <label className={labelClass}>
                    State
                    <input name="state" className={inputClass} placeholder="NY" />
                  </label>
                  <label className={labelClass}>
                    ZIP
                    <input name="zip" className={inputClass} />
                  </label>
                </div>
              </div>
            </>
          )}

          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              disabled={pending || (mode === "existing" && !attachTo) || (mode === "new" && duplicateMatches.length > 0 && !allowDuplicateName)}
              className="h-10 rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60"
            >
              {pending ? "Approving…" : "Approve and activate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
