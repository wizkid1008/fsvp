import { Activity, Bell, BookOpenCheck, Download, LockKeyhole, RefreshCw, Settings2, UsersRound } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InviteUserButton } from "@/components/admin/InviteUserButton";
import { RolePreviewSelector } from "@/components/admin/RolePreview";
import { UserManagement } from "@/components/admin/UserManagement";
import { AdminWorkflowControls, type WorkflowSetting } from "@/components/admin/AdminWorkflowControls";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Profile, Database } from "@/types/database";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

type ProfileLookup = {
  data: Pick<Profile, "email" | "full_name" | "organization_name" | "role" | "user_status" | "last_login_at"> | null;
};

type CountLookup = {
  count: number | null;
};

async function getCount(table: keyof Database["public"]["Tables"], supabase: ReturnType<typeof createServerSupabaseClient>) {
  const result = (await supabase.from(table).select("id", { count: "exact", head: true })) as unknown as CountLookup;
  return result.count ?? 0;
}

const fallbackWorkflowSettings: WorkflowSetting[] = [
  { setting_key: "require_email_verification", label: "Require email verification", detail: "Block protected access until Supabase email confirmation completes.", boolean_value: true },
  { setting_key: "escalate_critical_gaps", label: "Escalate critical gaps", detail: "Notify administrators when critical evidence gaps remain open after 7 days.", boolean_value: true },
  { setting_key: "allow_supplier_self_upload", label: "Allow supplier self-upload", detail: "Suppliers can upload documents into assigned requirement queues.", boolean_value: true },
  { setting_key: "auto_generate_audit_events", label: "Auto-generate audit events", detail: "Log role changes, document reviews, report exports, and corrective action updates.", boolean_value: true }
];

function formatAction(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function AdminPage() {
  const { supabase, user, role } = await requireProfileRole("/admin", ["administrator"]);

  const { data: profile } = (await supabase
    .from("profiles")
    .select("email,full_name,organization_name,role,user_status,last_login_at")
    .eq("id", user.id)
    .maybeSingle()) as unknown as ProfileLookup;

  const { data: allUsers } = await supabase
    .from("profiles")
    .select("id, email, full_name, organization_name, role, user_status, last_login_at")
    .order("created_at", { ascending: false });

  const { data: supplierQueue } = await (supabase.from("suppliers") as any)
    .select("id, company_name, country, approval_status, certification_status, updated_at, contact_json")
    .order("updated_at", { ascending: false });

  const [{ data: rawSettings }, { data: rawReferenceDocs }, { data: rawAuditLogs }, { data: rawNotifications }] = await Promise.all([
    (supabase.from("app_settings") as any)
      .select("setting_key, label, detail, boolean_value")
      .eq("category", "workflow")
      .order("sort_order"),
    (supabase.from("background_reference_documents") as any)
      .select("id, title, category, storage_path, active, updated_at")
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(5),
    (supabase.from("audit_logs") as any)
      .select("id, action, record_type, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    (supabase.from("app_notifications") as any)
      .select("id, title, body, target_url, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const suppliers = (supplierQueue ?? []) as Array<{
    id: string;
    company_name: string;
    country: string;
    approval_status: string;
    certification_status: string;
    updated_at: string;
    contact_json: Record<string, string> | null;
  }>;
  const workflowSettings = ((rawSettings ?? []) as WorkflowSetting[]).length > 0
    ? (rawSettings as WorkflowSetting[])
    : fallbackWorkflowSettings;
  const referenceDocs = (rawReferenceDocs ?? []) as Array<{
    id: string;
    title: string;
    category: string;
    storage_path: string;
    active: boolean;
    updated_at: string;
  }>;
  const auditLogs = (rawAuditLogs ?? []) as Array<{
    id: string;
    action: string;
    record_type: string | null;
    created_at: string;
  }>;
  const notifications = (rawNotifications ?? []) as Array<{
    id: string;
    title: string;
    body: string | null;
    target_url: string | null;
    created_at: string;
    read_at: string | null;
  }>;
  const feedItems = [
    ...auditLogs.map((event) => ({
      id: `audit-${event.id}`,
      title: formatAction(event.action),
      detail: event.record_type ? `Audit event for ${event.record_type.replace(/_/g, " ")}` : "Audit event",
      created_at: event.created_at,
      tone: "info" as StatusTone
    })),
    ...notifications.map((notification) => ({
      id: `notification-${notification.id}`,
      title: notification.title,
      detail: notification.body ?? "Notification",
      created_at: notification.created_at,
      tone: notification.read_at ? "neutral" as StatusTone : "warning" as StatusTone
    }))
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8);

  const userCount = await getCount("profiles", supabase);
  const documentCount = await getCount("documents", supabase);
  const status = profile?.user_status ?? "pending";

  const pendingSuppliers = suppliers.filter((s) => s.approval_status === "pending_review").length;

  const adminMetrics: Array<{ label: string; value: string; detail: string; tone: StatusTone }> = [
    { label: "Users", value: String(userCount || (user ? 1 : 0)), detail: "registered accounts", tone: "info" },
    { label: "Documents", value: String(documentCount), detail: "uploaded to Supabase", tone: documentCount > 0 ? "info" : "neutral" },
    { label: "Suppliers", value: String(suppliers.length), detail: `${pendingSuppliers} pending review`, tone: suppliers.length > 0 ? "info" : "neutral" },
    { label: "Pending Review", value: String(pendingSuppliers), detail: "suppliers awaiting approval", tone: pendingSuppliers > 0 ? "warning" : "success" }
  ];

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Admin Command Center"
        description="Manage users, roles, supplier queues, workflow rules, reference content, security settings, and audit visibility for ThrushCross Verify."
        actionSlot={<InviteUserButton />}
      />

      <div className="mt-6">
        <RolePreviewSelector />
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {adminMetrics.map((metric) => (
          <article key={metric.label} className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-slate-500">{metric.label}</p>
              <StatusBadge tone={metric.tone}>{metric.value}</StatusBadge>
            </div>
            <p className="mt-3 text-3xl font-semibold text-ink">{metric.value}</p>
            <p className="mt-2 text-sm text-slate-600">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="mt-6">
        <UserManagement users={(allUsers ?? []) as any} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="hidden" />

        <aside className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Security Posture</h2>
              <p className="mt-1 text-sm text-slate-500">Auth, role protection, and deployment checks.</p>
            </div>
            <LockKeyhole className="h-5 w-5 text-[#2DA8FF]" />
          </div>
          <div className="mt-5 space-y-4">
            {[
              ["Supabase Auth", user ? "Connected" : "No session"],
              ["Profile role", role],
              ["Profile status", status],
              ["Storage documents", `${documentCount} visible`]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <StatusBadge tone={value === "No session" || value === "pending" ? "warning" : "success"}>{value}</StatusBadge>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-ink">Supplier Oversight Queue</h2>
              <p className="mt-1 text-sm text-slate-500">{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""} on file</p>
            </div>
            <UsersRound className="h-5 w-5 text-[#2DA8FF]" />
          </div>
          {suppliers.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-base font-semibold text-ink">No suppliers yet</p>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
                Add suppliers from the Suppliers page to begin tracking readiness status here.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-slate-50">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Supplier</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Country</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {suppliers.map((s) => {
                  const tone: StatusTone =
                    s.approval_status === "approved" ? "success" :
                    s.approval_status === "pending_review" ? "warning" :
                    s.approval_status === "suspended" || s.approval_status === "rejected" ? "danger" : "neutral";
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink">{s.company_name}</p>
                        {s.contact_json?.email && <p className="text-xs text-slate-400">{s.contact_json.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.country}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={tone}>
                          {s.approval_status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{new Date(s.updated_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Workflow Controls</h2>
              <p className="mt-1 text-sm text-slate-500">Default controls for supplier and reviewer workflows.</p>
            </div>
            <Settings2 className="h-5 w-5 text-[#2DA8FF]" />
          </div>
          <div className="mt-5 space-y-4">
            <AdminWorkflowControls settings={workflowSettings} />
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Reference Library</h2>
              <p className="mt-1 text-sm text-slate-500">Reference documents, templates, and regulatory material from Supabase.</p>
            </div>
            <BookOpenCheck className="h-5 w-5 text-[#2DA8FF]" />
          </div>
          {referenceDocs.length === 0 ? (
            <div className="mt-5 rounded-md border border-dashed border-line bg-slate-50 px-5 py-8 text-center">
              <p className="text-sm font-semibold text-ink">No reference documents yet</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Upload templates, regulatory references, and risk prompts to populate this library.</p>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-line rounded-md border border-line">
              {referenceDocs.map((doc) => (
                <div key={doc.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{doc.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{doc.category} - Updated {new Date(doc.updated_at).toLocaleDateString()}</p>
                    </div>
                    <StatusBadge tone="success">Active</StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" />
            Sync Library
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-ink">Audit & Notification Feed</h2>
              <p className="mt-1 text-sm text-slate-500">Audit events will populate from Supabase as users take actions.</p>
            </div>
            <div className="flex gap-2">
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line text-slate-600 hover:bg-slate-50" aria-label="Notification settings">
                <Bell className="h-4 w-4" />
              </button>
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line text-slate-600 hover:bg-slate-50" aria-label="Export audit feed">
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>
          {feedItems.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-md bg-sky-50 text-[#0A2540]">
                <Activity className="h-4 w-4" />
              </span>
              <p className="mt-3 text-base font-semibold text-ink">No audit events yet</p>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
                Role changes, document reviews, report exports, and corrective action updates will appear here after
                records exist.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {feedItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-5 py-4">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sky-50 text-[#0A2540]">
                    <Activity className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
                    <p className="mt-1 text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</p>
                  </div>
                  <StatusBadge tone={item.tone}>{item.tone === "warning" ? "New" : "Logged"}</StatusBadge>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
