import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CheckCircle2, Bell } from "lucide-react";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

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

export default async function ActionItemsPage() {
  const { role } = await requireProfileRole("/my-requests", ["supplier"]);
  const supabase = createServerSupabaseClient();

  type ActionRow = {
    id: string;
    issue_description: string;
    triggered_by: string;
    status: string;
    triggered_at: string;
    action_taken: string | null;
    investigation_summary: string | null;
    decision: string | null;
  };

  const { data: rawActions } = await (supabase.from("corrective_actions") as any)
    .select("id, issue_description, triggered_by, status, triggered_at, action_taken, investigation_summary, decision")
    .order("triggered_at", { ascending: false });

  const actions = (rawActions ?? []) as ActionRow[];
  const open = actions.filter((a) => a.status !== "closed");
  const resolved = actions.filter((a) => a.status === "closed");

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Action Items"
        description="These are tasks your importer or reviewer has asked you to complete — uploading missing documents, responding to findings, or providing additional evidence."
      />

      {actions.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No action items"
          description="You're all clear. When your importer requests additional documents, flags a finding, or needs a revision, it will appear here with clear instructions on what to do."
        />
      ) : (
        <div className="mt-6 space-y-8">
          {open.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Bell className="h-4 w-4 text-red-500" />
                <h2 className="text-sm font-semibold text-ink">Needs your attention ({open.length})</h2>
              </div>
              <div className="space-y-3">
                {open.map((action) => (
                  <div
                    key={action.id}
                    className="relative overflow-hidden rounded-lg border border-line bg-white p-5 shadow-soft pl-6 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-red-500"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-ink leading-snug">{action.issue_description}</p>
                        <p className="mt-1.5 text-xs text-slate-500">
                          Reason: <span className="font-medium text-slate-700">{TRIGGERED_BY_LABELS[action.triggered_by] ?? action.triggered_by}</span>
                          <span className="mx-2">·</span>
                          Opened: <span className="font-medium text-slate-700">{new Date(action.triggered_at).toLocaleDateString()}</span>
                        </p>
                        {action.investigation_summary && (
                          <div className="mt-3 rounded-md bg-slate-50 border border-line p-3 text-sm text-slate-700">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">What's needed</p>
                            {action.investigation_summary}
                          </div>
                        )}
                      </div>
                      <StatusBadge tone={statusTone(action.status)}>
                        {action.status === "in_progress" ? "In Progress" : "Open"}
                      </StatusBadge>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <a
                        href="/my-evidence"
                        className="inline-flex h-8 items-center rounded-md bg-forest px-3 text-xs font-semibold text-white hover:bg-[#195f4d] transition"
                      >
                        Upload evidence
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resolved.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-slate-500">Resolved ({resolved.length})</h2>
              </div>
              <div className="space-y-2">
                {resolved.map((action) => (
                  <div
                    key={action.id}
                    className="relative overflow-hidden rounded-lg border border-line bg-slate-50 px-5 py-3 pl-6 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-emerald-500"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-600 line-through">{action.issue_description}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{new Date(action.triggered_at).toLocaleDateString()}</p>
                      </div>
                      <StatusBadge tone="success">Resolved</StatusBadge>
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
