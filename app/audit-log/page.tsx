import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  ClipboardList, FileText, Users, ShieldCheck, AlertTriangle,
  Settings, FolderCheck, BookOpen
} from "lucide-react";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

const ACTION_ICONS: Record<string, React.ElementType> = {
  document: FileText,
  user: Users,
  supplier: ShieldCheck,
  corrective_action: AlertTriangle,
  settings: Settings,
  fsvp_record: FolderCheck,
  rule_version: BookOpen,
};

function getIcon(action: string, recordType: string | null) {
  const combined = `${action} ${recordType ?? ""}`.toLowerCase();
  const key = Object.keys(ACTION_ICONS).find((k) => combined.includes(k));
  return key ? ACTION_ICONS[key] : ClipboardList;
}

function actionTone(action: string): StatusTone {
  if (action.includes("approved") || action.includes("accepted")) return "success";
  if (action.includes("rejected") || action.includes("removed")) return "danger";
  if (action.includes("revision") || action.includes("corrective") || action.includes("conditionally")) return "warning";
  if (action.includes("created") || action.includes("published")) return "info";
  return "neutral";
}

function roleTone(role: string | null): StatusTone {
  if (role === "administrator") return "danger";
  if (role === "reviewer") return "info";
  if (role === "us_importer") return "success";
  if (role === "supplier") return "warning";
  return "neutral";
}

const RECORD_TYPE_OPTIONS = [
  "fsvp_records", "documents", "suppliers", "facilities_verify",
  "products_verify", "corrective_actions", "rule_versions",
];

const ACTION_FILTER_OPTIONS = [
  { value: "evidence", label: "Evidence actions" },
  { value: "fsvp_record", label: "FSVP record actions" },
  { value: "approved", label: "Approvals" },
  { value: "rejected", label: "Rejections" },
  { value: "created", label: "Created" },
  { value: "rule_version", label: "Rule changes" },
];

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams?: { action?: string; record_type?: string; limit?: string };
}) {
  const { role } = await requireProfileRole("/audit-log", ["reviewer", "administrator"]);
  const supabase = createServerSupabaseClient();

  const filterAction = searchParams?.action ?? "";
  const filterRecordType = searchParams?.record_type ?? "";
  const pageLimit = Math.min(parseInt(searchParams?.limit ?? "50", 10), 200);

  type AuditLogRow = {
    id: string;
    action: string;
    actor_role: string | null;
    record_type: string | null;
    record_id: string | null;
    previous_value: Record<string, unknown> | null;
    new_value: Record<string, unknown> | null;
    created_at: string;
    actor_profile_id: string | null;
    profiles: { email: string; full_name: string | null } | null;
  };

  let query = (supabase.from("audit_logs") as any)
    .select("id, action, actor_role, record_type, record_id, previous_value, new_value, created_at, actor_profile_id, profiles(email, full_name)")
    .order("created_at", { ascending: false })
    .limit(pageLimit);

  if (filterAction) {
    query = query.ilike("action", `%${filterAction}%`);
  }
  if (filterRecordType) {
    query = query.eq("record_type", filterRecordType);
  }

  const { data: rawLogs } = await query;
  const logs = (rawLogs ?? []) as AuditLogRow[];

  function buildUrl(params: Record<string, string>) {
    const p = new URLSearchParams();
    if (filterAction && !("action" in params)) p.set("action", filterAction);
    if (filterRecordType && !("record_type" in params)) p.set("record_type", filterRecordType);
    if (pageLimit !== 50 && !("limit" in params)) p.set("limit", String(pageLimit));
    Object.entries(params).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k); });
    const str = p.toString();
    return `/audit-log${str ? `?${str}` : ""}`;
  }

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Audit Log"
        description="Timestamped record of all compliance actions — evidence reviews, FSVP record decisions, rule changes, and more."
      />

      {/* Filter bar */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter:</span>

        {ACTION_FILTER_OPTIONS.map((opt) => (
          <a
            key={opt.value}
            href={buildUrl({ action: filterAction === opt.value ? "" : opt.value })}
            className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition ${
              filterAction === opt.value
                ? "border-forest bg-forest text-white"
                : "border-line bg-white text-slate-600 hover:border-forest hover:text-forest"
            }`}
          >
            {opt.label}
          </a>
        ))}

        <select
          value={filterRecordType}
          onChange={(e) => { window.location.href = buildUrl({ record_type: e.target.value }); }}
          className="h-8 rounded-md border border-line bg-white px-2 text-xs text-slate-700 focus:border-forest focus:outline-none"
        >
          <option value="">All record types</option>
          {RECORD_TYPE_OPTIONS.map((rt) => (
            <option key={rt} value={rt}>{rt.replace(/_/g, " ")}</option>
          ))}
        </select>

        {(filterAction || filterRecordType) && (
          <a href="/audit-log" className="text-xs font-semibold text-slate-400 hover:text-red-600">
            Clear filters
          </a>
        )}

        <span className="ml-auto text-xs text-slate-400">{logs.length} entries</span>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No audit events match your filters"
          description="Try clearing the filters or performing actions in the platform to generate audit entries."
        />
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-slate-50">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Action</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Actor</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Role</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Record</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Detail</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logs.map((log) => {
                  const Icon = getIcon(log.action, log.record_type);
                  const actor = log.profiles as { email: string; full_name: string | null } | null;
                  const detail = log.new_value
                    ? Object.entries(log.new_value).slice(0, 2).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")
                    : null;

                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100">
                            <Icon className="h-3.5 w-3.5 text-slate-500" />
                          </div>
                          <StatusBadge tone={actionTone(log.action)}>
                            {log.action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </StatusBadge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {actor?.full_name || actor?.email || <span className="text-slate-400">System</span>}
                      </td>
                      <td className="px-4 py-3">
                        {log.actor_role ? (
                          <StatusBadge tone={roleTone(log.actor_role)}>
                            {log.actor_role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </StatusBadge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 capitalize">
                        {log.record_type?.replace(/_/g, " ") ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">
                        {detail ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {logs.length === pageLimit && (
            <div className="mt-4 text-center">
              <a
                href={buildUrl({ limit: String(pageLimit + 50) })}
                className="inline-flex h-9 items-center rounded-md border border-line px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Load more
              </a>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
