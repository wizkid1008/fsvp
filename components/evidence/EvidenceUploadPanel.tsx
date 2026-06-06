"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText } from "lucide-react";

const DOCUMENT_CATEGORIES = [
  "Food Safety Plan", "HACCP Plan", "Certificate of Analysis", "Audit Report",
  "GMP Certification", "FDA Registration", "Recall Record", "Traceability Record",
  "Supplier Questionnaire", "Product Specification", "Allergen Control Program",
  "Environmental Monitoring", "Corrective Action Report", "Laboratory Testing Report",
  "Training Record", "Other",
];

export function EvidenceUploadPanel() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (files?.[0]) setFile(files[0]);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setError(null);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const title = formData.get("title")?.toString().trim() || file.name;
    const category = formData.get("category")?.toString() ?? "Other";

    startTransition(async () => {
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("title", title);
        body.append("category", category);

        const res = await fetch("/api/documents/upload", { method: "POST", body });
        const json = await res.json() as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Upload failed.");

        setMessage("Document uploaded successfully.");
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
      <p className="mt-1 text-xs text-slate-500">PDF, Word, Excel, or image files up to 50 MB</p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 transition ${
            dragging ? "border-forest bg-emerald-50" : "border-line hover:border-forest hover:bg-slate-50"
          }`}
        >
          {file ? (
            <>
              <FileText className="h-8 w-8 text-forest" />
              <p className="mt-2 text-sm font-medium text-ink">{file.name}</p>
              <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">Drop file here or click to browse</p>
            </>
          )}
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>

        {file && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Document Title
              <input
                name="title"
                defaultValue={file.name.replace(/\.[^.]+$/, "")}
                className="mt-1.5 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-forest"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Category
              <select name="category" className="mt-1.5 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-forest bg-white">
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {message && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {file && (
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setFile(null)} className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Clear
            </button>
            <button
              disabled={pending}
              className="h-10 rounded-md bg-forest px-5 text-sm font-semibold text-white hover:bg-[#195f4d] disabled:opacity-60"
            >
              {pending ? "Uploading…" : "Upload document"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
