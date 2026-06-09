"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, FileText, X,
  CheckCircle2, XCircle, Clock, AlertCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DOCUMENT_UPLOAD_MAX_BYTES, DOCUMENT_UPLOAD_MAX_LABEL } from "@/lib/constants";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { StatusTone } from "@/types/platform";

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
  required_count:       number;
  accepted_count:       number;
  submitted_count:      number;
  under_review_count:   number;
  needs_revision_count: number;
  missing_count:        number;
  has_critical_blocker: boolean;
  weight_percent:       number;
}

function sectionStatus(p: SectionProgressProps | null): string | null {
  if (!p || p.required_count === 0) return null;
  if (p.accepted_count >= p.required_count) return "accepted";
  if (p.needs_revision_count > 0)           return "needs_revision";
  if (p.under_review_count > 0)             return "under_review";
  if (p.submitted_count > 0)               return "submitted";
  return null;
}

function StatusIcon({ status }: { status: string | null }) {
  if (status === "accepted")
    return <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />;
  if (status === "under_review" || status === "submitted")
    return <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />;
  if (status === "needs_revision")
    return <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />;
  return <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />;
}

function statusTone(status: string | null): StatusTone {
  if (status === "accepted")                        return "success";
  if (status === "under_review")                    return "info";
  if (status === "submitted")                       return "warning";
  if (status === "needs_revision")                  return "danger";
  return "neutral";
}

function statusLabel(status: string | null): string {
  if (!status)                    return "Not started";
  if (status === "accepted")      return "Complete";
  if (status === "under_review")  return "Under Review";
  if (status === "submitted")     return "Submitted";
  if (status === "needs_revision") return "Needs Revision";
  return status;
}

export function CorporateScopeUploadTile({
  sectionKey,
  label,
  description,
  requiredItems,
  supplierId,
  progress,
}: {
  sectionKey:    string;
  label:         string;
  description:   string;
  requiredItems: string;   // comma-separated item names
  supplierId:    string | null;
  progress:      SectionProgressProps | null;
}) {
  const router    = useRouter();
  const inputRef  = useRef<HTMLInputElement>(null);
  const [open, setOpen]           = useState(false);
  const [dragging, setDragging]   = useState(false);
  const [file, setFile]           = useState<File | null>(null);
  const [message, setMessage]     = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const status = sectionStatus(progress);
  const isComplete = status === "accepted";

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

    const fd = new FormData(e.currentTarget);
    const title          = fd.get("title")?.toString().trim() || file.name;
    const expirationDate = fd.get("expiration_date")?.toString() ?? "";

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
        if (expirationDate)       body.append("expiration_date", expirationDate);

        const res  = await fetch("/api/documents/upload", { method: "POST", body });
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
    <div>
      {/* ── Row (always visible) ─────────────────────────────── */}
      <div className="flex items-start gap-4 px-5 py-4 transition-colors hover:bg-slate-50">
        <StatusIcon status={status} />

        {/* Text block */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{label}</p>
          {description && (
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
          )}
          {requiredItems && (
            <p className="mt-1 text-xs text-slate-400">
              <span className="font-medium text-slate-500">Required: </span>
              {requiredItems}
            </p>
          )}
          {progress && progress.required_count > 0 && (
            <p className="mt-1 text-xs text-slate-400">
              {progress.accepted_count} of {progress.required_count} accepted
              {progress.has_critical_blocker && !isComplete && (
                <span className="ml-2 font-semibold text-red-600">· Critical blocker</span>
              )}
            </p>
          )}
        </div>

        {/* Right action */}
        <div className="flex shrink-0 items-center gap-2">
          {status && status !== "accepted" && (
            <StatusBadge tone={statusTone(status)}>{statusLabel(status)}</StatusBadge>
          )}
          {isComplete ? (
            <StatusBadge tone="success">Complete</StatusBadge>
          ) : (
            <button
              type="button"
              onClick={() => { setOpen((v) => !v); setMessage(null); setError(null); }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-forest px-3 text-xs font-semibold text-forest transition hover:bg-emerald-50"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </button>
          )}
        </div>
      </div>

      {/* ── Inline upload panel ──────────────────────────────── */}
      {open && (
        <div className="border-t border-line bg-slate-50 px-5 pb-4 pt-3">
          {!supplierId ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Your account is not linked to a supplier record yet.
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
                  dragging
                    ? "border-forest bg-emerald-50"
                    : "border-line hover:border-forest hover:bg-white"
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
