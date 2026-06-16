"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, X } from "lucide-react";
import { DOCUMENT_UPLOAD_MAX_BYTES, DOCUMENT_UPLOAD_MAX_LABEL } from "@/lib/constants";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const DOCUMENT_CATEGORIES = [
  "Food Safety Plan", "HACCP Plan", "Certificate of Analysis", "Audit Report",
  "GMP Certification", "FDA Registration", "Recall Record", "Traceability Record",
  "Supplier Questionnaire", "Product Specification", "Allergen Control Program",
  "Environmental Monitoring", "Corrective Action Report", "Laboratory Testing Report",
  "Training Record", "Other",
];

export function DirectEntityUploadTile({
  linkType,
  entityId,
  supplierId,
  documentCategories = DOCUMENT_CATEGORIES,
}: {
  linkType: "facility" | "product";
  entityId: string;
  supplierId: string;
  documentCategories?: string[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFiles(files: FileList | null) {
    const next = files?.[0];
    if (!next) return;
    setMessage(null);
    if (next.size > DOCUMENT_UPLOAD_MAX_BYTES) {
      setError(`File must be ${DOCUMENT_UPLOAD_MAX_LABEL} or smaller.`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError(null);
    setFile(next);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setError(null);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const title = formData.get("title")?.toString().trim() || file.name;
    const category = formData.get("category")?.toString() ?? "Other";
    const expirationDate = formData.get("expiration_date")?.toString() ?? "";

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
        body.append("title", title);
        body.append("document_kind", category);
        body.append("supplier_id", supplierId);
        body.append("link_type", linkType);
        if (linkType === "facility") body.append("facility_id", entityId);
        if (linkType === "product") body.append("product_id", entityId);
        if (profile?.importer_id) body.append("importer_id", profile.importer_id);
        if (expirationDate) body.append("expiration_date", expirationDate);

        const res = await fetch("/api/documents/upload", { method: "POST", body });
        const json = (await res.json()) as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Upload failed.");

        setMessage("Uploaded successfully.");
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <h3 className="text-sm font-semibold text-ink">Upload Evidence</h3>
      <p className="mt-1 text-xs text-slate-500">
        Uploaded here, this document is tagged directly to this {linkType} — no extra selection needed.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-8 transition ${
            dragging ? "border-forest bg-emerald-50" : "border-line hover:border-forest hover:bg-slate-50"
          }`}
        >
          {file ? (
            <>
              <FileText className="h-7 w-7 text-forest" />
              <p className="mt-2 text-sm font-medium text-ink">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
            </>
          ) : (
            <>
              <Upload className="h-7 w-7 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">Drop file here or click to browse</p>
              <p className="text-xs text-slate-400">Up to {DOCUMENT_UPLOAD_MAX_LABEL}</p>
            </>
          )}
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>

        {file && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-slate-700">
              Document Title
              <input
                name="title"
                defaultValue={file.name.replace(/\.[^.]+$/, "")}
                className="mt-1.5 h-9 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-forest"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Category
              <select name="category" className="mt-1.5 h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest">
                {documentCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Expiration Date (if applicable)
              <input
                type="date"
                name="expiration_date"
                className="mt-1.5 h-9 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-forest"
              />
            </label>
          </div>
        )}

        {message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</p>}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

        {file && (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }}
              className="flex h-8 items-center gap-1 rounded-md border border-line px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
            <button
              disabled={pending}
              className="h-8 rounded-md bg-forest px-4 text-xs font-semibold text-white hover:bg-[#195f4d] disabled:opacity-60"
            >
              {pending ? "Uploading…" : "Upload document"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
