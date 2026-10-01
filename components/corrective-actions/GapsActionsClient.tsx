"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewCorrectiveActionModal } from "./NewCorrectiveActionModal";
import { UpdateCorrectiveActionModal, type ActionRow } from "./UpdateCorrectiveActionModal";
import type { StatusTone } from "@/types/platform";

function statusTone(status: string): StatusTone {
  if (status === "closed") return "success";
  if (status === "in_progress") return "warning";
  return "danger";
}

function statusLabel(status: string) {
  return status === "in_progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1);
}

interface Props {
  actions: ActionRow[];
  canCreate: boolean;
}

export function GapsActionsClient({ actions, canCreate }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<ActionRow | null>(null);

  return (
    <>
      {canCreate && (
        <div className="mt-1 flex justify-end">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-forest px-3 py-2 text-sm font-semibold text-white hover:bg-forest/90"
          >
            <Plus className="h-4 w-4" />
            New Corrective Action
          </button>
        </div>
      )}

      {actions.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={AlertTriangle}
            title="No corrective actions"
            description="Corrective actions appear here when verification evidence is rejected, a gap is identified, or a recall triggers follow-up work."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {actions.map((action) => (
            <div
              key={action.id}
              // A product's "Resolve corrective action" links here.
              id={`ca-${action.id}`}
              className={`relative scroll-mt-6 overflow-hidden rounded-lg border border-line bg-white p-5 shadow-soft pl-6 target:ring-2 target:ring-forest/40 before:absolute before:inset-y-0 before:left-0 before:w-1 ${
                action.status === "closed"
                  ? "before:bg-emerald-500"
                  : action.status === "in_progress"
                  ? "before:bg-amber-400"
                  : "before:bg-red-500"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink leading-snug">{action.issue_description}</p>
                  {/* What it is about. The page loaded both ids and showed
                      neither, so an action could not be traced to anything. */}
                  <p className="mt-1 text-sm text-slate-600">
                    <Link href={`/exporters/${action.supplier_id}`} className="font-medium text-forest hover:underline">
                      {action.suppliers?.company_name ?? "Exporter"}
                    </Link>
                    {" · "}
                    {action.product_id ? (
                      <Link href={`/products/${action.product_id}`} className="font-medium text-forest hover:underline">
                        {action.products_verify?.product_name ?? "Product"}
                      </Link>
                    ) : (
                      <span className="text-slate-500">all products from this exporter</span>
                    )}
                    {action.fsvp_record_id && (
                      <>
                        {" · "}
                        <Link href={`/fsvp-records/${action.fsvp_record_id}`} className="font-medium text-forest hover:underline">
                          FSVP record
                        </Link>
                      </>
                    )}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>Triggered: <span className="font-medium text-slate-700">{new Date(action.triggered_at).toLocaleDateString()}</span></span>
                    <span className="capitalize">Source: <span className="font-medium text-slate-700">{action.triggered_by.replace(/_/g, " ")}</span></span>
                    {action.closed_at && (
                      <span>Closed: <span className="font-medium text-slate-700">{new Date(action.closed_at).toLocaleDateString()}</span></span>
                    )}
                  </div>
                  {action.investigation_summary && (
                    <p className="mt-2 text-xs text-slate-500 line-clamp-2">{action.investigation_summary}</p>
                  )}
                  {/* Written by the exporter on their dashboard. */}
                  {action.supplier_response ? (
                    <div className="mt-2 rounded-md border border-line bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Response from {action.suppliers?.company_name ?? "the exporter"}
                      </p>
                      <p className="mt-0.5 whitespace-pre-line">{action.supplier_response}</p>
                    </div>
                  ) : action.status !== "closed" ? (
                    <p className="mt-2 text-xs text-slate-400">No response from the exporter yet.</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge tone={statusTone(action.status)}>{statusLabel(action.status)}</StatusBadge>
                  {action.status !== "closed" && canCreate && (
                    <button
                      onClick={() => setUpdateTarget(action)}
                      className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Update
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <NewCorrectiveActionModal onClose={() => setShowCreate(false)} />}
      {updateTarget && <UpdateCorrectiveActionModal action={updateTarget} onClose={() => setUpdateTarget(null)} />}
    </>
  );
}
