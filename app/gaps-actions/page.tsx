import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AlertTriangle } from "lucide-react";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function statusTone(status: string): StatusTone {
  if (status === "closed") return "success";
  if (status === "in_progress") return "warning";
  return "danger";
}

function statusLabel(status: string) {
  return status === "in_progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function GapsActionsPage() {
  const { role } = await requireProfileRole("/gaps-actions");
  const supabase = createServerSupabaseClient();

  const { data: actions } = await supabase
    .from("corrective_actions")
    .select(`
      id, issue_description, triggered_by, status, triggered_at, closed_at,
      supplier_id, foreign_suppliers(supplier_name),
      food_id, foods(food_name)
    `)
    .order("triggered_at", { ascending: false });

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Gaps & Actions"
        description="Track open corrective actions from verification findings, rejected evidence, recalls, and reassessments."
      />

      {!actions || actions.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No corrective actions"
          description="Corrective actions appear here when verification evidence is rejected, a gap is identified, or a recall triggers follow-up work."
        />
      ) : (
        <div className="mt-6 space-y-3">
          {actions.map((action) => {
            const supplier = action.foreign_suppliers as { supplier_name: string } | null;
            const food = action.foods as { food_name: string } | null;
            return (
              <div
                key={action.id}
                className={`relative overflow-hidden rounded-lg border border-line bg-white p-5 shadow-soft pl-6 before:absolute before:inset-y-0 before:left-0 before:w-1 ${
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
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {supplier && <span>Supplier: <span className="font-medium text-slate-700">{supplier.supplier_name}</span></span>}
                      {food && <span>Product: <span className="font-medium text-slate-700">{food.food_name}</span></span>}
                      <span>Triggered: <span className="font-medium text-slate-700">{new Date(action.triggered_at).toLocaleDateString()}</span></span>
                      <span className="capitalize">Source: <span className="font-medium text-slate-700">{action.triggered_by.replace(/_/g, " ")}</span></span>
                    </div>
                  </div>
                  <StatusBadge tone={statusTone(action.status)}>{statusLabel(action.status)}</StatusBadge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
