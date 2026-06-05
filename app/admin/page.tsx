import { Activity, Bell, BookOpenCheck, Download, LockKeyhole, Plus, RefreshCw, Search, Settings2, ShieldCheck, UsersRound } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

const adminMetrics: Array<{ label: string; value: string; detail: string; tone: StatusTone }> = [
  { label: "Active users", value: "24", detail: "3 pending verification", tone: "info" },
  { label: "Open supplier gaps", value: "18", detail: "6 critical gaps", tone: "warning" },
  { label: "Overdue actions", value: "5", detail: "2 need escalation", tone: "danger" },
  { label: "Audit coverage", value: "100%", detail: "core actions logged", tone: "success" }
];

const users: Array<{ name: string; email: string; role: string; organization: string; status: string; tone: StatusTone; lastActive: string }> = [
  {
    name: "Kyle Newell",
    email: "admin@thrushcross.com",
    role: "Administrator",
    organization: "ThrushCross Trading & Commodities",
    status: "Active",
    tone: "success",
    lastActive: "Today"
  },
  {
    name: "Maya Torres",
    email: "maya.torres@example.com",
    role: "Reviewer",
    organization: "Importer review team",
    status: "Invited",
    tone: "info",
    lastActive: "Pending"
  },
  {
    name: "Luis Herrera",
    email: "luis.herrera@example.com",
    role: "Supplier",
    organization: "Pacific Valley Foods",
    status: "Email unverified",
    tone: "warning",
    lastActive: "Yesterday"
  }
];

const supplierOversight: Array<{ supplier: string; country: string; queue: string; readiness: string; owner: string; tone: StatusTone }> = [
  { supplier: "Coastal Preserves", country: "Argentina", queue: "Critical commodity review", readiness: "48%", owner: "Unassigned", tone: "danger" },
  { supplier: "Pacific Valley Foods", country: "Chile", queue: "Corrective action follow-up", readiness: "67%", owner: "Maya Torres", tone: "warning" },
  { supplier: "Andes Ingredients", country: "Colombia", queue: "Final importer review", readiness: "84%", owner: "Kyle Newell", tone: "success" }
];

const workflowSettings = [
  { label: "Require email verification", detail: "Block protected access until Supabase email confirmation completes.", enabled: true },
  { label: "Escalate critical gaps", detail: "Notify administrators when critical evidence gaps remain open after 7 days.", enabled: true },
  { label: "Allow supplier self-upload", detail: "Suppliers can upload documents into assigned requirement queues.", enabled: true },
  { label: "Auto-generate audit events", detail: "Log role changes, document reviews, report exports, and corrective action updates.", enabled: true }
];

const referenceLibrary = [
  { item: "FSVP requirement library", version: "2026.06", status: "Published", tone: "success" as StatusTone },
  { item: "Commodity risk prompts", version: "Draft 4", status: "Review", tone: "info" as StatusTone },
  { item: "Email templates", version: "Baseline", status: "Needs setup", tone: "warning" as StatusTone }
];

const auditEvents = [
  { event: "Role updated", actor: "Kyle Newell", detail: "Assigned reviewer access to Pacific Valley Foods.", time: "12 min ago", tone: "info" as StatusTone },
  { event: "Requirement changed", actor: "System", detail: "Commodity hazard analysis moved to Critical Gap.", time: "1 hr ago", tone: "warning" as StatusTone },
  { event: "Report exported", actor: "Reviewer queue", detail: "Readiness report generated for Andes Ingredients.", time: "Today", tone: "success" as StatusTone }
];

export default function AdminPage() {
  return (
    <AppShell role="administrator">
      <SectionHeader
        title="Admin Command Center"
        description="Manage users, roles, supplier queues, workflow rules, reference content, security settings, and audit visibility for ThrushCross Verify."
        action="Invite User"
      />

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {adminMetrics.map((metric) => (
          <article key={metric.label} className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-slate-500">{metric.label}</p>
              <StatusBadge tone={metric.tone}>{metric.detail.split(" ")[0]}</StatusBadge>
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
              <p className="mt-1 text-sm text-slate-500">Invite users, assign roles, and verify organization access.</p>
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
                {users.map((user) => (
                  <tr key={user.email}>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-ink">{user.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-700">{user.role}</td>
                    <td className="px-5 py-4 text-slate-600">{user.organization}</td>
                    <td className="px-5 py-4">
                      <StatusBadge tone={user.tone}>{user.status}</StatusBadge>
                    </td>
                    <td className="px-5 py-4 text-slate-500">{user.lastActive}</td>
                  </tr>
                ))}
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
              ["Supabase Auth", "Connected"],
              ["Protected routes", "Enabled"],
              ["Node compatibility", "Enabled"],
              ["Storage buckets", "Pending review"]
            ].map(([label, status]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <StatusBadge tone={status === "Pending review" ? "warning" : "success"}>{status}</StatusBadge>
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
              <p className="mt-1 text-sm text-slate-500">Administrative view of risk, readiness, and ownership.</p>
            </div>
            <UsersRound className="h-5 w-5 text-[#2DA8FF]" />
          </div>
          <div className="divide-y divide-line">
            {supplierOversight.map((item) => (
              <article key={item.supplier} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_120px_130px] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">{item.supplier}</h3>
                    <StatusBadge tone={item.tone}>{item.readiness}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{item.country} | {item.queue}</p>
                </div>
                <p className="text-sm text-slate-600">{item.owner}</p>
                <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <ShieldCheck className="h-4 w-4" />
                  Review
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Workflow Controls</h2>
              <p className="mt-1 text-sm text-slate-500">Configure platform behavior for supplier and reviewer workflows.</p>
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
              <p className="mt-1 text-sm text-slate-500">Maintain FSVP content, risk prompts, templates, and background documents.</p>
            </div>
            <BookOpenCheck className="h-5 w-5 text-[#2DA8FF]" />
          </div>
          <div className="mt-5 space-y-3">
            {referenceLibrary.map((item) => (
              <div key={item.item} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-ink">{item.item}</p>
                  <p className="mt-1 text-xs text-slate-500">Version {item.version}</p>
                </div>
                <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
              </div>
            ))}
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
              <p className="mt-1 text-sm text-slate-500">Monitor high-value platform events and administrative changes.</p>
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
          <div className="divide-y divide-line">
            {auditEvents.map((event) => (
              <article key={`${event.event}-${event.time}`} className="grid gap-3 px-5 py-4 md:grid-cols-[44px_1fr_auto] md:items-start">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-sky-50 text-[#0A2540]">
                  <Activity className="h-4 w-4" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">{event.event}</h3>
                    <StatusBadge tone={event.tone}>{event.actor}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{event.detail}</p>
                </div>
                <p className="text-xs font-medium text-slate-500">{event.time}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
