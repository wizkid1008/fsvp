"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { DOCUMENT_UPLOAD_MAX_BYTES, DOCUMENT_UPLOAD_MAX_LABEL } from "@/lib/constants";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/**
 * "Upload another document" under a checklist — for anything the published
 * rules do not list: a supplementary certificate, a customer spec, a letter.
 *
 * Filed exactly as a checklist row files its upload (/api/documents/upload),
 * minus the requirement_item_id, so it is stored against the entity and goes
 * to review like any other document but does not answer — or count toward —
 * any required item. That route has always accepted an unmapped upload; until
 * now only the Evidence library offered one, and nothing on the entity's own
 * page showed it afterwards.
 */
export function OtherDocumentUpload({
  linkType,
  entityId,
  supplierId,
  viewerImporterId = null,
}: {
  linkType: "supplier" | "facility" | "product";
  entityId: string;
  supplierId: string;
  viewerImporterId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function choose(files: FileList | null) {
    const next = files?.[0] ?? null;
    setError(null);
    if (next && next.size > DOCUMENT_UPLOAD_MAX_BYTES) {
      setFile(null);
      setError(`File uploads must be ${DOCUMENT_UPLOAD_MAX_LABEL} or smaller.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(next);
    if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, ""));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const name = title.trim() || file.name;
    setError(null);

    startTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated.");
        const { data: profile } = await (supabase.from("profiles") as any)
          .select("importer_id")
          .eq("id", user.id)
          .maybeSingle();

        const body = new FormData();
        body.append("file", file);
        body.append("title", name);
        body.append("document_kind", name);
        body.append("supplier_id", supplierId);
        body.append("link_type", linkType);
        if (linkType === "facility") body.append("facility_id", entityId);
        if (linkType === "product") body.append("product_id", entityId);
        // Same precedence as RequirementItemRow: the uploader's own importer,
        // else the importer being viewed.
        const uploadImporterId = profile?.importer_id ?? viewerImporterId;
        if (uploadImporterId) body.append("importer_id", uploadImporterId);

        const res = await fetch("/api/documents/upload", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Upload failed.");

        setFile(null);
        setTitle("");
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-forest hover:text-forest"
      >
        <Plus className="h-3.5 w-3.5" />
        Upload another document
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-line bg-slate-50 p-4">
      <p className="text-xs text-slate-500">
        For anything not on the required list. It is kept with this {linkType === "supplier" ? "exporter" : linkType} and
        reviewed like any other document, but does not count toward the required documents.
      </p>
      <label className="block text-xs font-medium text-slate-600">
        Name
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Organic certificate"
          className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
        />
      </label>
      <input
        ref={inputRef}
        type="file"
        onChange={(e) => choose(e.target.files)}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
      />
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!file || pending}
          className="inline-flex h-8 items-center rounded-md bg-forest px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setFile(null); setError(null); }}
          className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
