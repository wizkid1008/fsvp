"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { OtherDocumentUpload } from "@/components/evidence/OtherDocumentUpload";

/**
 * § 1.504(a): relying on a hazard analysis someone else conducted.
 *
 * This used to be a free-standing written procedure on Our FSVP Records (later
 * the Company records tab) — one statement for the whole organization about a
 * decision that is made food by food. It belongs with the hazard analysis it
 * replaces or supports, and the qualified individual's signature on that
 * hazard analysis is what covers the review § 1.504(a) requires.
 *
 * Two parts, because they are different things: who conducted the analysis
 * (saved on the hazard analysis, draft only), and the analysis itself (filed as
 * a document against the product, kind hazard_analysis_reliance).
 */
export function HazardReliancePanel({
  hazardAnalysisId,
  analysisStatus,
  reliedOnOtherParty,
  reliedOnPartyName,
  documents,
  productId,
  supplierId,
  importerId,
  readonly,
}: {
  hazardAnalysisId: string;
  analysisStatus: string;
  reliedOnOtherParty: boolean;
  reliedOnPartyName: string | null;
  documents: Array<{ id: string; title: string; uploaded_at: string; evidence_status: string | null }>;
  productId: string;
  supplierId: string;
  importerId: string | null;
  readonly: boolean;
}) {
  const router = useRouter();
  const [relied, setRelied] = useState(reliedOnOtherParty);
  const [party, setParty] = useState(reliedOnPartyName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canEdit = !readonly && analysisStatus === "draft";
  const changed = relied !== reliedOnOtherParty || (relied && party.trim() !== (reliedOnPartyName ?? ""));

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/fsvp/hazard-analyses", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hazard_analysis_id: hazardAnalysisId,
            action: "reliance",
            relied_on_other_party: relied,
            relied_on_party_name: relied ? party.trim() : null,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Could not save.");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  return (
    <div className="mt-5 rounded-md border border-line bg-slate-50 p-4">
      <p className="text-sm font-semibold text-ink">Relying on someone else&apos;s hazard analysis?</p>
      <p className="mt-0.5 text-xs leading-5 text-slate-500">
        21 CFR 1.504(a) lets you rely on a hazard analysis conducted by a supplier, co-packer or third
        party, if you review and assess it. Record who conducted it and file it here; summarise your
        review in the hazard analysis above, which the qualified individual signs.
      </p>

      {canEdit ? (
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={relied} onChange={(e) => setRelied(e.target.checked)} />
            This hazard analysis was conducted by another party
          </label>
          {relied && (
            <input
              type="text"
              value={party}
              onChange={(e) => setParty(e.target.value)}
              placeholder="Who conducted it — e.g. the supplier's food safety team"
              className="h-9 w-full max-w-md rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
            />
          )}
          {changed && (
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex h-8 items-center rounded-md bg-forest px-3 text-xs font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-700">
          {reliedOnOtherParty
            ? `Relies on a hazard analysis conducted by ${reliedOnPartyName ?? "another party"}.`
            : "Conducted by this importer; no other party's analysis is relied on."}
          {!readonly && analysisStatus === "final" && (
            <span className="text-xs text-slate-500"> Reopen the analysis to change this.</span>
          )}
        </p>
      )}

      {(reliedOnOtherParty || relied) && (
        <div className="mt-3 border-t border-line pt-3">
          {documents.length === 0 ? (
            <p className="text-xs text-amber-700">The analysis you relied on has not been filed yet.</p>
          ) : (
            <ul className="space-y-1">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-2 text-xs text-slate-700">
                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                  {doc.title}
                  <span className="text-slate-400">
                    · {new Date(doc.uploaded_at).toLocaleDateString()} · {(doc.evidence_status ?? "submitted").replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!readonly && (
            <div className="mt-2">
              <OtherDocumentUpload
                linkType="product"
                entityId={productId}
                supplierId={supplierId}
                viewerImporterId={importerId}
                documentKind="hazard_analysis_reliance"
                buttonLabel="File the hazard analysis you relied on"
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
