import { Bell, CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

type SupabaseLike = { from: (table: string) => any };

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
};

export async function ActionItemsSection({
  supplierId,
  supabase,
}: {
  supplierId: string | null;
  supabase: SupabaseLike;
}) {
  const query = (supabase.from("corrective_actions") as any)
    .select("id, issue_description, triggered_by, status, triggered_at, investigation_summary")
    .order("triggered_at", { ascending: false });

  const { data: rawActions } = supplierId
    ? await query.eq("supplier_id", supplierId)
    : await query;

  const actions = (rawActions ?? []) as ActionRow[];
  const open = actions.filter((a) => a.status !== "closed");
  const resolved = actions.filter((a) => a.status === "closed");

  if (actions.length === 0) return null;

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Action Items</h2>
        {open.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
            <Bell className="h-3.5 w-3.5" />
            {open.length} need{open.length === 1 ? "s" : ""} attention
          </span>
        )}
      </div>

      <div className="divide-y divide-line">
        {open.map((action) => (
          <div key={action.id} className="relative overflow-hidden px-5 py-4 pl-6 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-red-500">
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

        {resolved.length > 0 && (
          <div className="px-5 py-3">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <p className="text-xs font-semibold text-slate-500">Resolved ({resolved.length})</p>
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
