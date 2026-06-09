"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, X, ChevronDown, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { DOCUMENT_UPLOAD_MAX_BYTES, DOCUMENT_UPLOAD_MAX_LABEL } from "@/lib/constants";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

// Maps section_key → default document_kind for the upload API
const SECTION_CATEGORY_MAP: Record<string, string> = {
  supplier_legal_entity:        "Other",
  supplier_contacts:            "Other",
  supplier_questionnaire:       "Supplier Questionnaire",
  supplier_food_safety_policy:  "Food Safety Plan",
  supplier_recall_traceability: "Recall Record",
  supplier_importer_assurances: "Other",
};

export interface SectionProgressProps {
  required_count:      number;
  accepted_count:      number;
  submitted_count:     number;
  under_review_count:  number;
  needs_revision_count: number;
  missing_count:       number;
  has_critical_blocker: boolean;
  weight_percent:      number;
}

function progressPercent(p: SectionProgressProps): number {
  if (p.required_count === 0) return 0;
  if (p.accepted_count === 0) {
    if (p.submitted_count + p.under_review_count === 0) return 0;
    return 25;
  }
  if (p.accepted_count < p.required_count) return 50;
  if (p.has_critical_blocker) return 75;
  return 100;
}

function ProgressPip({ progress }: { progress: SectionProgressProps }) {
  const pct = progressPercent(progress);

  const statusLabel = () => {
    if (progress.required_count === 0) return "Not started";
    if (pct === 100) return "Complete";
    if (progress.needs_revision_count > 0) return "Needs revision";
    if (progress.under_review_count > 0) return "Under review";
    if (progress.submitted_count > 0) return "Submitted";
    if (progress.accepted_count > 0) return "In progress";
    return "Not started";
  };

  const Icon = pct === 100 ? CheckCircle2 : pct >= 25 ? Clock : AlertCircle;
  const iconColor = pct === 100 ? "text-emerald-500" : pct >= 25 ? "text-amber-500" : "text-slate-400";
  const barColor = pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : pct >= 25 ? "bg-amber-300" : "bg-slate-200";

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
          <span className="text-xs text-slate-500">{statusLabel()}</span>
          {progress.has_critical_blocker && pct < 100 && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
              Critical
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          {progress.accepted_count}/{progress.required_count} accepted · {progress.weight_percent}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function CorporateScopeUploadTile({
  sectionKey,
  label,
  supplierId,
  progress,
}: {
  sectionKey: string;
  label: string;
  supplierId: string | null;
  progress: SectionProgressProps | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || !supplierId) return;
    setError(null);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    const title = formData.get("title")?.toString().trim() || file.name;
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
        body.append("document_kind", SECTION_CATEGORY_MAP[sectionKey] ?? "Other");
        body.append("supplier_id", supplierId);
        body.append("link_type", "supplier");
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
    <div className="rounded-md border border-line bg-white overflow-hidden shadow-soft">
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setMessage(null); setError(null); }}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{label}</p>
          {progress && <ProgressPip progress={progress} />}
        </div>
        <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs font-medium text-forest">
          <Upload className="h-3.5 w-3.5" />
          Upload
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {/* Expandable upload panel */}
      {open && (
        <div className="border-t border-line bg-slate-50 px-4 pb-4 pt-3">
          {!supplierId ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Your account is not linked to a supplier record yet. Evidence cannot be uploaded until a supplier is created.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-6 transition ${
                  dragging ? "border-forest bg-emerald-50" : "border-line hover:border-forest hover:bg-white"
                }`}
              >
                {file ? (
                  <>
                    <FileText className="h-6 w-6 text-forest" />
                    <p className="mt-1 text-xs font-medium text-ink">{file.name}</p>
                    <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-slate-300" />
                    <p className="mt-1 text-xs text-slate-500">Drop file here or click to browse</p>
                    <p className="text-xs text-slate-400">Up to {DOCUMENT_UPLOAD_MAX_LABEL}</p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>

              {file && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Document Title
                    <input
                      name="title"
                      defaultValue={file.name.replace(/\.[^.]+$/, "")}
                      className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm font-normal outline-none focus:border-forest"
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">
                    Expiration Date (if applicable)
                    <input
                      type="date"
                      name="expiration_date"
                      className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm font-normal outline-none focus:border-forest"
                    />
                  </label>
                </div>
              )}

              {message && (
                <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</p>
              )}
              {error && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
              )}

              {file && (
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }}
                    className="flex h-8 items-center gap-1 rounded-md border border-line px-3 text-xs font-medium text-slate-600 hover:bg-white"
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
          )}
        </div>
      )}
    </div>
  );
}
