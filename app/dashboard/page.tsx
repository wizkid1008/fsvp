import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OnboardingModal, type OnboardingStep } from "@/components/onboarding/OnboardingModal";
import { requireUser } from "@/lib/auth/protection";
import { APP_SUBTITLE } from "@/lib/constants";
import { CheckCircle2, Circle } from "lucide-react";
import type { Profile } from "@/types/database";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

type ProfileLookup = { data: Profile | null };

const IMPORTER_STEPS = [
  { label: "Complete your profile", href: "/account", key: "profile" },
  { label: "Add a supplier", href: "/suppliers", key: "supplier" },
  { label: "Add a product or facility", href: "/products", key: "product" },
  { label: "Upload evidence", href: "/evidence", key: "evidence" },
  { label: "Run readiness assessment", href: "/readiness", key: "readiness" },
];

const SUPPLIER_STEPS = [
  { label: "Complete your profile", href: "/account", key: "profile" },
  { label: "Add a facility", href: "/facilities", key: "facility" },
  { label: "Add a product", href: "/products", key: "product" },
  { label: "Upload your evidence", href: "/my-evidence", key: "evidence" },
  { label: "Review action items", href: "/my-requests", key: "readiness" },
];

function formatAction(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function DashboardPage() {
  const { supabase, user } = await requireUser("/dashboard");

  const [
    { data: profile },
    { count: supplierCount },
    { count: productCount },
    { count: facilityCount },
    { count: documentCount },
    { count: assessmentCount },
    { count: actionCount },
    { data: rawWorkflowSteps },
    { data: rawAuditLogs },
    { data: rawNotifications },
    { data: rawRecentDocuments },
    { data: rawRecentActions },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle() as unknown as Promise<ProfileLookup>,
    supabase.from("suppliers").select("id", { count: "exact", head: true }) as unknown as Promise<{ count: number | null }>,
    supabase.from("products_verify").select("id", { count: "exact", head: true }) as unknown as Promise<{ count: number | null }>,
    supabase.from("facilities_verify").select("id", { count: "exact", head: true }) as unknown as Promise<{ count: number | null }>,
    supabase.from("documents").select("id", { count: "exact", head: true }) as unknown as Promise<{ count: number | null }>,
    supabase.from("readiness_assessments").select("id", { count: "exact", head: true }) as unknown as Promise<{ count: number | null }>,
    supabase.from("corrective_actions").select("id", { count: "exact", head: true }).eq("status", "open") as unknown as Promise<{ count: number | null }>,
    (supabase.from("onboarding_steps") as any)
      .select("title, description, cta_label, cta_href, dashboard_label, dashboard_href, completion_key")
      .eq("role", "foreign_supplier")
      .eq("active", true)
      .order("sort_order"),
    (supabase.from("audit_logs") as any)
      .select("id, action, record_type, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    (supabase.from("app_notifications") as any)
      .select("id, title, body, target_url, created_at, read_at")
      .or(`recipient_profile_id.eq.${user.id},recipient_profile_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(5),
    (supabase.from("documents") as any)
      .select("id, title, document_kind, uploaded_at")
      .is("soft_deleted_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(5),
    (supabase.from("corrective_actions") as any)
      .select("id, issue_description, status, triggered_at")
      .order("triggered_at", { ascending: false })
      .limit(5),
  ]);

  const displayName = profile?.full_name || user.email || "New user";
  const role = profile?.role ?? "supplier";
  const status = profile?.user_status ?? "pending";
  const profileComplete = !!(profile?.full_name && profile.organization_name);

  const isSupplier = role === "supplier";
  const isImporter = role === "us_importer";
  const workflowRole = isSupplier ? "foreign_supplier" : isImporter ? "us_importer" : role;
  let workflowRows = (rawWorkflowSteps ?? []) as Array<{
    title: string;
    description: string;
    cta_label: string;
    cta_href: string;
    dashboard_label: string | null;
    dashboard_href: string | null;
    completion_key: string;
  }>;

  if (!isSupplier) {
    const { data: importerSteps } = await (supabase.from("onboarding_steps") as any)
      .select("title, description, cta_label, cta_href, dashboard_label, dashboard_href, completion_key")
      .eq("role", workflowRole)
      .eq("active", true)
      .order("sort_order");
    workflowRows = (importerSteps ?? []) as typeof workflowRows;
  }

  const STEPS = workflowRows.length > 0
    ? workflowRows.map((step) => ({
        label: step.dashboard_label ?? step.title,
        href: step.dashboard_href ?? step.cta_href,
        key: step.completion_key
      }))
    : isSupplier ? SUPPLIER_STEPS : IMPORTER_STEPS;
  const onboardingSteps: OnboardingStep[] = workflowRows.map((step) => ({
    title: step.title,
    description: step.description,
    cta: { label: step.cta_label, href: step.cta_href }
  }));

  const stepDone: Record<string, boolean> = isSupplier
    ? {
        profile: profileComplete,
        facility: (facilityCount ?? 0) > 0,
        product: (productCount ?? 0) > 0,
        evidence: (documentCount ?? 0) > 0,
        readiness: (actionCount ?? 0) === 0,
      }
    : {
        profile: profileComplete,
        supplier: (supplierCount ?? 0) > 0,
        product: (productCount ?? 0) > 0,
        evidence: (documentCount ?? 0) > 0,
        readiness: (assessmentCount ?? 0) > 0,
      };

  const completedSteps = Object.values(stepDone).filter(Boolean).length;
  const progressPct = Math.round((completedSteps / STEPS.length) * 100);

  const metrics = isSupplier
    ? [
        { label: "Documents Submitted", value: String(documentCount ?? 0), href: "/my-evidence", tone: (documentCount ?? 0) > 0 ? "info" as const : "neutral" as const },
        { label: "Action Items", value: String(actionCount ?? 0), href: "/my-requests", tone: (actionCount ?? 0) > 0 ? "danger" as const : "success" as const },
      ]
    : [
        { label: "Suppliers", value: String(supplierCount ?? 0), href: "/suppliers", tone: (supplierCount ?? 0) > 0 ? "info" as const : "neutral" as const },
        { label: "Documents", value: String(documentCount ?? 0), href: "/evidence", tone: (documentCount ?? 0) > 0 ? "info" as const : "neutral" as const },
        { label: "Open Actions", value: String(actionCount ?? 0), href: "/gaps-actions", tone: (actionCount ?? 0) > 0 ? "danger" as const : "success" as const },
        { label: "Assessments", value: String(assessmentCount ?? 0), href: "/readiness", tone: (assessmentCount ?? 0) > 0 ? "success" as const : "neutral" as const },
      ];

  const showOnboarding = completedSteps === 0;
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
  const recentDocuments = (rawRecentDocuments ?? []) as Array<{
    id: string;
    title: string;
    document_kind: string;
    uploaded_at: string;
  }>;
  const recentActions = (rawRecentActions ?? []) as Array<{
    id: string;
    issue_description: string;
    status: string;
    triggered_at: string;
  }>;
  const activityItems = [
    ...auditLogs.map((event) => ({
      id: `audit-${event.id}`,
      title: formatAction(event.action),
      detail: event.record_type ? `Updated ${event.record_type.replace(/_/g, " ")}` : "Audit event",
      href: "/audit-log",
      created_at: event.created_at,
      tone: "info" as StatusTone
    })),
    ...recentDocuments.map((document) => ({
      id: `document-${document.id}`,
      title: document.title,
      detail: `Uploaded ${document.document_kind.replace(/_/g, " ")}`,
      href: isSupplier ? "/my-evidence" : "/evidence",
      created_at: document.uploaded_at,
      tone: "success" as StatusTone
    })),
    ...recentActions.map((action) => ({
      id: `action-${action.id}`,
      title: action.issue_description,
      detail: `Corrective action ${action.status.replace(/_/g, " ")}`,
      href: isSupplier ? "/my-requests" : "/gaps-actions",
      created_at: action.triggered_at,
      tone: action.status === "closed" ? "success" as StatusTone : "warning" as StatusTone
    })),
    ...notifications.map((notification) => ({
      id: `notification-${notification.id}`,
      title: notification.title,
      detail: notification.body ?? "Notification",
      href: notification.target_url ?? "/dashboard",
      created_at: notification.created_at,
      tone: notification.read_at ? "neutral" as StatusTone : "warning" as StatusTone
    }))
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  return (
    <AppShell role={role}>
      {showOnboarding && <OnboardingModal role={role} steps={onboardingSteps} />}
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Dashboard</p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">{displayName}</h1>
            <p className="mt-1 text-sm text-slate-500">{profile?.organization_name || "No organization linked yet"} - {APP_SUBTITLE}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="info">{role}</StatusBadge>
            <StatusBadge tone={status === "active" ? "success" : "warning"}>{status}</StatusBadge>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <Link key={m.label} href={m.href} className="group rounded-lg border border-line bg-white p-5 shadow-soft transition hover:border-forest">
            <p className="text-sm font-medium text-slate-500 group-hover:text-forest">{m.label}</p>
            <p className="mt-2 text-4xl font-semibold text-ink">{m.value}</p>
            <StatusBadge tone={m.tone} className="mt-3">{m.tone === "neutral" ? "None yet" : "Active"}</StatusBadge>
          </Link>
        ))}
      </section>

      <section className="mt-4 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h2 className="text-base font-semibold text-ink">Recent Activity</h2>
          {activityItems.length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-md border border-dashed border-line bg-slate-50 py-12 text-center">
              <p className="text-sm font-semibold text-slate-600">No activity yet</p>
              <p className="mt-1 text-sm text-slate-400">Actions, reviews, and uploads will appear here.</p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-line rounded-md border border-line">
              {activityItems.map((item) => (
                <Link key={item.id} href={item.href} className="flex items-start justify-between gap-4 px-4 py-3 transition hover:bg-slate-50">
                  <span>
                    <span className="block text-sm font-semibold text-ink">{item.title}</span>
                    <span className="mt-1 block text-sm text-slate-500">{item.detail}</span>
                    <span className="mt-1 block text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</span>
                  </span>
                  <StatusBadge tone={item.tone}>{item.tone === "warning" ? "New" : "Logged"}</StatusBadge>
                </Link>
              ))}
            </div>
          )}
        </div>

        <aside className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Setup Progress</h2>
            <span className="text-sm font-bold text-forest">{progressPct}%</span>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-forest transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <ol className="mt-5 space-y-2">
            {STEPS.map((step, i) => {
              const done = stepDone[step.key];
              return (
                <li key={step.key}>
                  <Link
                    href={step.href}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition ${
                      done
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-line bg-white text-slate-700 hover:border-forest hover:bg-slate-50"
                    }`}
                  >
                    {done
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      : <Circle className="h-4 w-4 shrink-0 text-slate-300" />
                    }
                    <span className="font-medium">{step.label}</span>
                    {!done && <span className="ml-auto text-xs text-slate-400">Step {i + 1}</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
        </aside>
      </section>
    </AppShell>
  );
}
