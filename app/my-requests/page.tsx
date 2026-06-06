import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Bell } from "lucide-react";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function statusTone(status: string): StatusTone {
  if (status === "closed") return "success";
  if (status === "in_progress") return "warning";
  return "danger";
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function MyRequestsPage() {
  const { role } = await requireProfileRole("/my-requests", ["supplier"]);
  const supabase = createServerSupabaseClient();

  type ActionRow = { id: string; issue_description: string; triggered_by: string; status: string; triggered_at: string; action_taken: string | null; investigation_summary: string | null };

  const { data: rawActions } = await (supabase.from("corrective_actions") as any)
    .select("id, issue_description, triggered_by, status, triggered_at, action_taken, investigation_summary")
    .order("triggered_at", { ascending: false });

  const actions = (rawActions ?? []) as ActionRow[];
  const open = actions.filter((a) => a.status !== "closed");
  const closed = actions.filter((a) => a.status === "closed");

  return (
    <AppShell role={role}>
      <SectionHeader
        title="My Requests"
        description="Open requests and corrective actions from your importer. Respond to each item to keep your FSVP compliance on track."
      />

      {actions.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No open requests"
          description="When your importer or reviewer requests additional information or corrective actions, they will appear here."
        />
      ) : (
        <div className="mt-6 space-y-6">
          {open.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Open ({open.length})</h2>
              <div className="space-y-3">
                {open.map((action) => (
                  <div
                    key={action.id}
                    className="relative overflow-hidden rounded-lg border border-line bg-white p-5 shadow-soft pl-6 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-red-500"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-ink">{action.issue_description}</p>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 text-xs text-slate-500">
                          <span>Source: <span className="font-medium text-slate-700 capitalize">{action.triggered_by.replace(/_/g, " ")}</span></span>
                          <span>Opened: <span className="font-medium text-slate-700">{new Date(action.triggered_at).toLocaleDateString()}</span></span>
                        </div>
                        {action.investigation_summary && (
                          <p className="mt-2 text-sm text-slate-600">{action.investigation_summary}</p>
                        )}
                      </div>
                      <StatusBadge tone={statusTone(action.status)}>{statusLabel(action.status)}</StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {closed.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Resolved ({closed.length})</h2>
              <div className="space-y-3">
                {closed.map((action) => (
                  <div
                    key={action.id}
                    className="relative overflow-hidden rounded-lg border border-line bg-white p-5 shadow-soft pl-6 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-emerald-500 opacity-75"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium text-ink">{action.issue_description}</p>
                        <p className="mt-1 text-xs text-slate-500">{new Date(action.triggered_at).toLocaleDateString()}</p>
                      </div>
                      <StatusBadge tone="success">Closed</StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
