"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "lucide-react";
import { DOCUMENT_UPLOAD_MAX_BYTES, DOCUMENT_UPLOAD_MAX_LABEL } from "@/lib/constants";

/**
 * Files one of the importer's own FSVP documents.
 *
 * Deliberately narrower than EvidenceUploadPanel: there is no supplier to
 * choose, no product, no facility, and no requirement to map to. The obligation
 * is fixed by the regulation and named by the section this sits under, so
 * document_kind is passed in rather than picked — which also means the page can
 * tell which obligation a filed document answers.
 */
export function ImporterRecordUpload({
  documentKind,
  label,
  importerId,
  hasDocuments,
}: {
  documentKind: string;
  label: string;
  importerId: string;
  hasDocuments: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(file: File | undefined) {
    setError(null);
    if (!file) return;

    if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
      setError(`Files must be ${DOCUMENT_UPLOAD_MAX_LABEL} or smaller.`);
      return;
    }

    startTransition(async () => {
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("title", label);
        body.append("document_kind", documentKind);
        body.append("link_type", "importer");
        body.append("importer_id", importerId);

        const res = await fetch("/api/documents/upload", { method: "POST", body });
        const json = (await res.json()) as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Upload failed.");

        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        id={`file-${documentKind}`}
        className="sr-only"
        onChange={(event) => choose(event.currentTarget.files?.[0])}
      />
      <label
        htmlFor={`file-${documentKind}`}
        className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
      >
        <Paperclip className="h-3.5 w-3.5" />
        {pending ? "Filing…" : hasDocuments ? "File another" : "File this document"}
      </label>
      <span className="text-xs text-slate-500">PDF, Word, Excel or image, up to {DOCUMENT_UPLOAD_MAX_LABEL}</span>
      {error && <p className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
