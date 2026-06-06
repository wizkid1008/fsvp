import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ClipboardList, FileText, Users, ShieldCheck, AlertTriangle, Settings } from "lucide-react";

export const runtime = "edge";

const ACTION_ICONS: Record<string, React.ElementType> = {
  document: FileText,
  user: Users,
  supplier: ShieldCheck,
  corrective_action: AlertTriangle,
  settings: Settings,
};

function getIcon(recordType: string | null) {
  if (!recordType) return ClipboardList;
  const key = Object.keys(ACTION_ICONS).find((k) => recordType.includes(k));
  return key ? ACTION_ICONS[key] : ClipboardList;
}

export default async function AuditLogPage() {
  const { role } = await requireProfileRole("/audit-log", ["reviewer", "administrator"]);
  const supabase = createServerSupabaseClient();

  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id, action, record_type, record_id, created_at, actor_profile_id, profiles(email, full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Audit Log"
        description="Timestamped record of all actions taken in the platform — document reviews, role changes, supplier updates, and more."
        action={{ label: "Export log", href: "#" }}
      />

      {!logs || logs.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No audit events yet"
          description="Every action in the platform — uploads, reviews, role changes, and approvals — is recorded here automatically."
        />
      ) : (
        <div className="mt-6 rounded-lg border border-line bg-white shadow-soft overflow-hidden">
          <div className="divide-y divide-line">
            {logs.map((log, i) => {
              const Icon = getIcon(log.record_type);
              const actor = log.profiles as { email: string; full_name: string | null } | null;
              const isLast = i === logs.length - 1;

              return (
                <div key={log.id} className="flex gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                  <div className="relative flex flex-col items-center">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-white shadow-sm">
                      <Icon className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    {!isLast && <div className="mt-1 w-px flex-1 bg-line" />}
                  </div>
                  <div className="pb-4 min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink leading-snug">{log.action}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      {actor && <span>{actor.full_name || actor.email}</span>}
                      {log.record_type && <span className="capitalize">{log.record_type.replace(/_/g, " ")}</span>}
                      <time>{new Date(log.created_at).toLocaleString()}</time>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AppShell>
  );
}
