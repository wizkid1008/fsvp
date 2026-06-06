import { Activity, Bell, BookOpenCheck, Download, LockKeyhole, Plus, RefreshCw, Search, Settings2, UsersRound } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RolePreviewSelector } from "@/components/admin/RolePreview";
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

const workflowSettings = [
  { label: "Require email verification", detail: "Block protected access until Supabase email confirmation completes.", enabled: true },
  { label: "Escalate critical gaps", detail: "Notify administrators when critical evidence gaps remain open after 7 days.", enabled: true },
  { label: "Allow supplier self-upload", detail: "Suppliers can upload documents into assigned requirement queues.", enabled: true },
  { label: "Auto-generate audit events", detail: "Log role changes, document reviews, report exports, and corrective action updates.", enabled: true }
];

export default async function AdminPage() {
  const { supabase, user, role } = await requireProfileRole("/admin", ["administrator"]);

  const { data: profile } = (await supabase
    .from("profiles")
    .select("email,full_name,organization_name,role,user_status,last_login_at")
    .eq("id", user.id)
    .maybeSingle()) as unknown as ProfileLookup;

  const userCount = await getCount("profiles", supabase);
  const documentCount = await getCount("documents", supabase);
  const status = profile?.user_status ?? "pending";
  const displayName = profile?.full_name || user?.email || "Current user";
  const displayEmail = profile?.email || user?.email || "No email found";

  const adminMetrics: Array<{ label: string; value: string; detail: string; tone: StatusTone }> = [
    { label: "Supabase users", value: String(userCount || (user ? 1 : 0)), detail: "visible through RLS", tone: "info" },
    { label: "Documents uploaded", value: String(documentCount), detail: "stored in Supabase", tone: documentCount > 0 ? "info" : "neutral" },
    { label: "Supplier queues", value: "0", detail: "no records created yet", tone: "neutral" },
    { label: "Audit events", value: "0", detail: "no app events logged yet", tone: "neutral" }
  ];

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Admin Command Center"
        description="Manage users, roles, supplier queues, workflow rules, reference content, security settings, and audit visibility for ThrushCross Verify."
        action="Invite User"
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

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-ink">User & Role Management</h2>
              <p className="mt-1 text-sm text-slate-500">This table reflects the current Supabase profile visible to this session.</p>
            </div>
            <div className="flex gap-2">
              <button className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line text-slate-600 hover:bg-slate-50" aria-label="Search users">
                <Search className="h-4 w-4" />
              </button>
              <button className="inline-flex h-10 items-center gap-2 rounded-md bg-[#2DA8FF] px-3 text-sm font-semibold text-[#0A2540] hover:bg-sky-300">
                <Plus className="h-4 w-4" />
                Invite
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-ink">{displayName}</p>
                    <p className="mt-1 text-xs text-slate-500">{displayEmail}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-700">{role}</td>
                  <td className="px-5 py-4 text-slate-600">{profile?.organization_name || "Not linked"}</td>
                  <td className="px-5 py-4">
                    <StatusBadge tone={status === "active" ? "success" : "warning"}>{status}</StatusBadge>
                  </td>
                  <td className="px-5 py-4 text-slate-500">{profile?.last_login_at ? new Date(profile.last_login_at).toLocaleDateString("en-US") : "No login stamp"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

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
              <p className="mt-1 text-sm text-slate-500">Supplier rows will appear here after they are created in Supabase.</p>
            </div>
            <UsersRound className="h-5 w-5 text-[#2DA8FF]" />
          </div>
          <div className="px-5 py-10 text-center">
            <p className="text-base font-semibold text-ink">No suppliers yet</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Create supplier, commodity, product, and facility records before this administrative queue begins tracking
              readiness status.
            </p>
          </div>
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
            {workflowSettings.map((setting) => (
              <label key={setting.label} className="flex items-start justify-between gap-4 border-b border-line pb-4 last:border-0 last:pb-0">
                <span>
                  <span className="block text-sm font-semibold text-ink">{setting.label}</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-500">{setting.detail}</span>
                </span>
                <input type="checkbox" defaultChecked={setting.enabled} className="mt-1 h-5 w-5 rounded border-slate-300 text-forest" />
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Reference Library</h2>
              <p className="mt-1 text-sm text-slate-500">Reference documents will appear after upload to Supabase.</p>
            </div>
            <BookOpenCheck className="h-5 w-5 text-[#2DA8FF]" />
          </div>
          <div className="mt-5 rounded-md border border-dashed border-line bg-slate-50 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-ink">No reference documents yet</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">Upload templates, regulatory references, and risk prompts to populate this library.</p>
          </div>
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
        </div>
      </section>
    </AppShell>
  );
}
