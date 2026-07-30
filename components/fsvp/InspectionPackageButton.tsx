"use client";

import { useState } from "react";
import { FileArchive } from "lucide-react";

/**
 * Produces the artifact an importer hands to FDA when records are requested.
 *
 * There is no API to submit FSVP records to FDA — the FSVP Importer Portal is a
 * manual upload inside FDA Industry Systems, and it only opens once FDA has
 * initiated an inspection. The binding constraint during a records request is
 * assembling the package, not transmitting it, so that is what this builds.
 * See docs/importer-workflow-analysis.md §2.
 */
export function InspectionPackageButton({ recordId }: { recordId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_type: "fsvp_record_package",
          format: "html",
          fsvp_record_id: recordId,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(json.error ?? "Could not build the package.");
      }

      const html = await res.text();
      const url  = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      window.open(url, "_blank", "noopener");
      // Give the new tab time to load before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={generate}
        disabled={pending}
        title="Assemble the full record as one printable document for an FDA records request"
        className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest disabled:opacity-60"
      >
        <FileArchive className="h-4 w-4" />
        {pending ? "Building…" : "Inspection Package"}
      </button>
      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}
