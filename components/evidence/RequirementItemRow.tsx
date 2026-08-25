"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, AlertCircle, XCircle, Upload, FileText, X, PenLine } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DOCUMENT_UPLOAD_MAX_BYTES, DOCUMENT_UPLOAD_MAX_LABEL } from "@/lib/constants";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { StatusTone } from "@/types/platform";

function StatusIcon({ status }: { status: string }) {
  if (status === "accepted") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  if (status === "under_review" || status === "submitted" || status === "in_progress") return <Clock className="h-4 w-4 shrink-0 text-amber-400" />;
  if (status === "needs_revision" || status === "rejected") return <XCircle className="h-4 w-4 shrink-0 text-red-500" />;
  return <AlertCircle className="h-4 w-4 shrink-0 text-slate-300" />;
}

function statusTone(status: string): StatusTone {
  if (status === "accepted") return "success";
  if (status === "under_review") return "info";
  if (status === "submitted" || status === "in_progress") return "warning";
  if (status === "needs_revision" || status === "rejected") return "danger";
  return "neutral";
}

function statusLabel(status: string): string {
  if (status === "not_submitted") return "Missing";
  if (status === "in_progress") return "In Progress";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RequirementItemRow({
  itemName,
  status,
  isCriticalBlocker,
  linkType,
  entityId,
  supplierId,
  requirementItemId,
  createAction,
}: {
  itemName: string;
  status: string;
  isCriticalBlocker: boolean;
  // "supplier" is company-level evidence, where the supplier IS the entity —
  // /api/documents/upload already defaults link_type to it and takes
  // supplier_id separately, so the two entity branches below simply do not fire.
  linkType: "supplier" | "facility" | "product";
  entityId: string;
  supplierId: string;
  requirementItemId: string;
  createAction?: {
    productId: string;
    existingHref: string | null;
    /**
     * Set when creation is known to be refused. Carries why, and the screen
     * that clears it — a blocker naming a step the reader cannot reach from
     * where they are standing is only half a gate.
     */
    blocked?: { reason: string; href: string; cta: string } | null;
  };
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [creating, startCreateTransition] = useTransition();
  const isAccepted = status === "accepted";

  function handleFiles(files: FileList | null) {
    const next = files?.[0];
    if (!next) return;
    if (next.size > DOCUMENT_UPLOAD_MAX_BYTES) {
      setError(`File must be ${DOCUMENT_UPLOAD_MAX_LABEL} or smaller.`);
      setFile(null);
      return;
    }
    setError(null);
    setFile(next);
  }

  function startGeneratedHazardAnalysis() {
    if (!createAction) return;
    setCreateError(null);

    if (createAction.existingHref) {
      router.push(createAction.existingHref);
      return;
    }

    startCreateTransition(async () => {
      try {
        const res = await fetch("/api/product-hazard-analysis/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: createAction.productId }),
        });
        const json = (await res.json()) as { error?: string; href?: string };
        if (!res.ok || json.error || !json.href) {
          throw new Error(json.error ?? "Failed to create hazard analysis.");
        }
        router.push(json.href);
        router.refresh();
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Failed to create hazard analysis.");
      }
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
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
        body.append("title", itemName);
        body.append("document_kind", itemName);
        body.append("supplier_id", supplierId);
        body.append("link_type", linkType);
        body.append("requirement_item_id", requirementItemId);
        if (linkType === "facility") body.append("facility_id", entityId);
        if (linkType === "product") body.append("product_id", entityId);
        if (profile?.importer_id) body.append("importer_id", profile.importer_id);

        const res = await fetch("/api/documents/upload", { method: "POST", body });
        const json = (await res.json()) as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Upload failed.");

        setFile(null);
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  return (
    <div className="border-b border-line last:border-b-0">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <StatusIcon status={status} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{itemName}</p>
          {isCriticalBlocker && !isAccepted && (
            <p className="text-xs font-semibold text-red-600">Critical blocker</p>
          )}
        </div>
        <StatusBadge tone={statusTone(status)}>{statusLabel(status)}</StatusBadge>
        {createAction && !isAccepted && (
          createAction.blocked ? (
            <a
              href={createAction.blocked.href}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-forest px-2.5 text-xs font-semibold text-forest hover:bg-emerald-50"
            >
              {createAction.blocked.cta}
            </a>
          ) : (
            <button
              type="button"
              onClick={startGeneratedHazardAnalysis}
              disabled={creating}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <PenLine className="h-3 w-3" />
              {creating ? "Opening..." : createAction.existingHref ? "Open" : "Create"}
            </button>
          )
        )}
        {!isAccepted && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-forest px-2.5 text-xs font-semibold text-forest hover:bg-emerald-50"
          >
            <Upload className="h-3 w-3" /> Upload
          </button>
        )}
      </div>

      {/* Stated up front rather than after a click that was always going to
          fail. Not red: nothing has gone wrong, there is simply a step in
          front of this one. The way out is the button above — repeating it
          here would give one row two of the same link. */}
      {createAction?.blocked && !isAccepted && (
        <div className="border-t border-line bg-slate-50 px-4 py-2 text-xs text-slate-600">
          {createAction.blocked.reason}
        </div>
      )}

      {createError && (
        <div className="border-t border-line bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {createError}
        </div>
      )}

      {open && (
        <div className="border-t border-line bg-slate-50 px-4 py-3">
          <form onSubmit={submit} className="space-y-2">
            <div
              onClick={() => inputRef.current?.click()}
              className="flex cursor-pointer items-center gap-2 rounded-md border-2 border-dashed border-line bg-white px-3 py-2 hover:border-forest"
            >
              {file ? (
                <>
                  <FileText className="h-4 w-4 text-forest" />
                  <span className="text-xs text-ink">{file.name}</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 text-slate-300" />
                  <span className="text-xs text-slate-500">Click to choose a file (up to {DOCUMENT_UPLOAD_MAX_LABEL})</span>
                </>
              )}
              <input ref={inputRef} type="file" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            </div>

            {/* Upload failures only. The applicability link that used to be
                sniffed out of this message with a regex has moved to the
                blocked banner above: /api/documents/upload never returns an
                applicability message, so the test could not fire here — the
                message it was written for comes from the CREATE path. */}
            {error && <p className="text-xs text-red-600">{error}</p>}

            {file && (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }}
                  className="flex h-7 items-center gap-1 rounded-md border border-line bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
                <button
                  disabled={pending}
                  className="h-7 rounded-md bg-forest px-3 text-xs font-semibold text-white hover:bg-[#195f4d] disabled:opacity-60"
                >
                  {pending ? "Uploading…" : "Upload"}
                </button>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
