import { CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import { SupplierResponseForm } from "@/components/corrective-actions/SupplierResponseForm";
import type { StatusTone } from "@/types/platform";

/**
 * Corrective actions an importer has raised against this exporter, on the
 * exporter's dashboard — with which importer and product each is about, and a
 * box to answer it.
 *
 * WHY THIS USED TO BE ALWAYS EMPTY
 *
 * It read corrective_actions through the exporter's own session, and that
 * table's RLS (004_reviewer_tenancy.sql) admits only the importer's tenant and
 * platform staff. An exporter could never see an action raised against them,
 * so supplier_response — a column made for their side of § 1.508 — had no way
 * to be filled. Read through the admin client now, scoped by hand to actions
 * naming this exporter's company; the response goes through
 * /api/corrective-actions/[id], which checks the same thing.
 */

const TRIGGERED_BY_LABELS: Record<string, string> = {
  verification_finding: "Verification finding",
  recall: "Recall event",
  consumer_complaint: "Consumer complaint",
  inspector_finding: "FDA inspection finding",
  reassessment: "Reassessment",
  other: "Other",
};

function statusTone(status: string): StatusTone {
  if (status === "closed") return "success";
  if (status === "in_progress") return "warning";
  return "danger";
}

type ActionRow = {
  id: string;
  issue_description: string;
  triggered_by: string;
  status: string;
  triggered_at: string;
  investigation_summary: string | null;
  supplier_response: string | null;
  importers: { display_name: string | null } | null;
  products_verify: { product_name: string } | null;
};

export async function ActionItemsSection({
  supplierId,
}: {
  supplierId: string | null;
  /** Unused since the read moved to the admin client; kept so callers need not change. */
  supabase?: unknown;
}) {
  // No company, nothing to scope to — and never "everything".
  if (!supplierId) return null;
  const adminResult = tryAdminClient();
  if (!adminResult.ok) return null;

  const { data: rawActions } = await (adminResult.client.from("corrective_actions") as any)
    .select("id, issue_description, triggered_by, status, triggered_at, investigation_summary, supplier_response, importers(display_name), products_verify(product_name)")
    .eq("supplier_id", supplierId)
    .order("triggered_at", { ascending: false });

  const actions = (rawActions ?? []) as ActionRow[];
  const open = actions.filter((a) => a.status !== "closed");
  const resolved = actions.filter((a) => a.status === "closed");

  if (actions.length === 0) return null;

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Corrective actions</h2>
        {open.length > 0 && (
          <span className="text-xs font-semibold text-red-600">
            {open.length} need{open.length === 1 ? "s" : ""} your response
          </span>
        )}
      </div>

      <div className="divide-y divide-line">
        {open.map((action) => (
          <div key={action.id} className="relative overflow-hidden px-5 py-4 pl-6 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-red-500">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug text-ink">{action.issue_description}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Raised by <span className="font-medium text-slate-800">{action.importers?.display_name ?? "your importer"}</span>
                  {" · "}
                  {action.products_verify?.product_name ?? "all your products for them"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {TRIGGERED_BY_LABELS[action.triggered_by] ?? action.triggered_by}
                  {" · opened "}
                  {new Date(action.triggered_at).toLocaleDateString()}
                </p>
                {action.investigation_summary && (
                  <div className="mt-3 rounded-md border border-line bg-slate-50 p-3 text-sm text-slate-700">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">What&apos;s needed</p>
                    {action.investigation_summary}
                  </div>
                )}
              </div>
              <StatusBadge tone={statusTone(action.status)}>
                {action.status === "in_progress" ? "In progress" : "Open"}
              </StatusBadge>
            </div>
            <div className="mt-3">
              <SupplierResponseForm actionId={action.id} current={action.supplier_response} />
            </div>
          </div>
        ))}

        {resolved.length > 0 && (
          <div className="px-5 py-3">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <p className="text-xs font-semibold text-slate-500">Closed ({resolved.length})</p>
            </div>
            <div className="space-y-1.5">
              {resolved.map((action) => (
                <div key={action.id} className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm text-slate-500 line-through">{action.issue_description}</p>
                  <span className="shrink-0 text-xs text-slate-400">{new Date(action.triggered_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
