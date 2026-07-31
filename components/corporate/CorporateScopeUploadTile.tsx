"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, FileText, X, ClipboardList,
  CheckCircle2, XCircle, Clock, AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FormFillPanel } from "@/components/forms/FormFillPanel";
import { DOCUMENT_UPLOAD_MAX_BYTES, DOCUMENT_UPLOAD_MAX_LABEL } from "@/lib/constants";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { StatusTone } from "@/types/platform";

const SECTION_CATEGORY_MAP: Record<string, string> = {
  supplier_legal_entity:        "Legal Entity and Ownership",
  supplier_contacts:            "Primary Contacts",
  supplier_questionnaire:       "Supplier Questionnaire",
  supplier_food_safety_policy:  "Corporate Food Safety Policy",
  supplier_recall_traceability: "Recall and Traceability Programs",
  supplier_importer_assurances: "Importer Relationship and Written Assurances",
};

export interface RequirementItem {
  id:                  string;
  item_name:           string;
  description:         string | null;
  is_critical_blocker: boolean;
  status:              string; // "not_submitted" | "submitted" | "under_review" | "accepted" | "needs_revision" | "rejected"
  /**
   * 'form' means the item is a set of questions answered in the app rather than
   * a document the supplier already holds. Uploading stays available either
   * way — a supplier who has the completed questionnaire on letterhead should
   * still be able to attach it.
   */
  evidence_type:       string | null;
}

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

function itemStatusTone(status: string): StatusTone {
  if (status === "accepted")       return "success";
  if (status === "under_review")   return "info";
  if (status === "submitted")      return "warning";
  if (status === "needs_revision") return "danger";
  if (status === "rejected")       return "danger";
  return "neutral";
}

function itemStatusLabel(status: string): string {
  if (status === "accepted")       return "Accepted";
  if (status === "under_review")   return "Under Review";
  if (status === "submitted")      return "Submitted";
  if (status === "needs_revision") return "Needs Revision";
  if (status === "rejected")       return "Rejected";
  return "Not started";
}

function SectionIcon({ progress }: { progress: SectionProgressProps | null }) {
  if (!progress || progress.required_count === 0)
    return <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />;
  if (progress.accepted_count >= progress.required_count)
    return <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />;
  if (progress.needs_revision_count > 0)
    return <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />;
  if (progress.under_review_count > 0 || progress.submitted_count > 0)
    return <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />;
  return <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />;
}

function ItemUploadSlot({
  item,
  sectionKey,
  supplierId,
}: {
  item:       RequirementItem;
  sectionKey: string;
  supplierId: string | null;
}) {
  const router   = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen]               = useState(false);
  const [dragging, setDragging]       = useState(false);
  const [file, setFile]               = useState<File | null>(null);
  const [message, setMessage]         = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [pending, startTransition]    = useTransition();
  const [filling, setFilling]         = useState(false);

  const isComplete = item.status === "accepted";
  const isForm     = item.evidence_type === "form";

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
        body.append("file",                 file);
        body.append("title",                title);
        body.append("document_kind",        SECTION_CATEGORY_MAP[sectionKey] ?? "Other");
        body.append("supplier_id",          supplierId);
        body.append("link_type",            "supplier");
        body.append("requirement_item_id",  item.id);
        if (profile?.importer_id) body.append("importer_id", profile.importer_id);
        if (expirationDate)       body.append("expiration_date", expirationDate);

        const res  = await fetch("/api/documents/upload", { method: "POST", body });
        const json = (await res.json()) as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Upload failed.");

        setMessage("Uploaded successfully.");
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  return (
    <div className="border-t border-line first:border-t-0">
      {/* Item row */}
      <div className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
        <div className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 mt-2" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{item.item_name}</p>
          {item.description && (
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{item.description}</p>
          )}
          <div className="mt-1 flex items-center gap-2">
            {item.status !== "not_submitted" && (
              <StatusBadge tone={itemStatusTone(item.status)}>
                {itemStatusLabel(item.status)}
              </StatusBadge>
            )}
            {item.is_critical_blocker && !isComplete && (
              <span className="text-xs font-semibold text-red-600">Critical blocker</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isComplete ? (
            <StatusBadge tone="success">Complete</StatusBadge>
          ) : (
            <>
              {isForm && (
                <button
                  type="button"
                  onClick={() => setFilling(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-forest px-3 text-xs font-semibold text-white transition hover:bg-[#195f4d]"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Fill in
                </button>
              )}
              <button
                type="button"
                onClick={() => { setOpen((v) => !v); setMessage(null); setError(null); }}
                title={isForm ? "Attach a completed copy instead of answering here" : undefined}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition ${
                  isForm
                    ? "border-line text-slate-600 hover:border-forest hover:text-forest"
                    : "border-forest text-forest hover:bg-emerald-50"
                }`}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload
                {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </>
          )}
        </div>
      </div>

      {filling && supplierId && (
        <FormFillPanel
          requirementItemId={item.id}
          supplierId={supplierId}
          onClose={() => setFilling(false)}
        />
      )}

      {/* Inline upload panel */}
      {open && (
        <div className="border-t border-line bg-slate-50 px-5 pb-4 pt-3">
          {!supplierId ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Your exporter profile is not set up yet. Complete your company overview before uploading evidence.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
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

export function CorporateScopeUploadTile({
  sectionKey,
  label,
  description,
  items,
  supplierId,
  progress,
}: {
  sectionKey:  string;
  label:       string;
  description: string;
  items:       RequirementItem[];
  supplierId:  string | null;
  progress:    SectionProgressProps | null;
}) {
  const isComplete = progress
    ? progress.accepted_count >= progress.required_count && progress.required_count > 0
    : false;

  return (
    <div>
      {/* Section header */}
      <div className="flex items-start gap-4 px-5 py-4">
        <SectionIcon progress={progress} />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{label}</p>
          {description && (
            <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
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

        {isComplete && (
          <StatusBadge tone="success">Complete</StatusBadge>
        )}
      </div>

      {/* Per-item upload slots */}
      {items.length > 0 && (
        <div className="mx-5 mb-4 overflow-hidden rounded-md border border-line bg-white">
          {items.map((item) => (
            <ItemUploadSlot
              key={item.id}
              item={item}
              sectionKey={sectionKey}
              supplierId={supplierId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
