import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { SupplierReadinessPanel } from "@/components/readiness/SupplierReadinessPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { SectionProgress } from "@/components/evidence/SectionProgressBar";
import { OnboardingModal, type OnboardingStep } from "@/components/onboarding/OnboardingModal";
import { requireUser } from "@/lib/auth/protection";
import { APP_SUBTITLE } from "@/lib/constants";
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

  // FSVP-specific data — loaded conditionally after role is known
  let fsvpRecordCounts = { approved: 0, conditional: 0, pending: 0, reassessmentDue: 0, total: 0 };
  let supplierSectionProgress: SectionProgress[] = [];

  if (isImporter) {
    const { data: rawFsvp } = await (supabase.from("fsvp_records") as any)
      .select("status, reassessment_due_at");
    const fsvpRows = (rawFsvp ?? []) as Array<{ status: string; reassessment_due_at: string | null }>;
    const now = new Date();
    fsvpRecordCounts = {
      total: fsvpRows.length,
      approved: fsvpRows.filter((r) => r.status === "importer_approved").length,
      conditional: fsvpRows.filter((r) => r.status === "conditionally_approved").length,
      pending: fsvpRows.filter((r) => ["draft", "importer_review_pending", "supplier_evidence_accepted"].includes(r.status)).length,
      reassessmentDue: fsvpRows.filter((r) => r.reassessment_due_at && new Date(r.reassessment_due_at) <= now).length,
    };
  }

  if (isSupplier && profile?.supplier_id) {
    const { data: pubVer } = await (supabase.from("rule_versions") as any)
      .select("id")
      .eq("status", "published")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pubVer?.id) {
      const { data: rawSections } = await (supabase.from("requirement_sections") as any)
        .select("id, section_key, section_name, applies_to, sort_order")
        .eq("rule_version_id", pubVer.id)
        .order("sort_order");

      const sectionIds = (rawSections ?? []).map((s: { id: string }) => s.id);
      const [weightsRes, itemsRes, docsRes] = await Promise.all([
        (supabase.from("scoring_category_weights") as any)
          .select("section_id, weight_percent")
          .eq("rule_version_id", pubVer.id),
        sectionIds.length > 0
          ? (supabase.from("requirement_items") as any)
              .select("id, section_id, is_required, is_critical_blocker")
              .in("section_id", sectionIds)
              .eq("is_required", true)
          : Promise.resolve({ data: [] }),
        (supabase.from("documents") as any)
          .select("requirement_item_id, evidence_status")
          .eq("supplier_id", profile.supplier_id)
          .is("soft_deleted_at", null)
          .not("requirement_item_id", "is", null),
      ]);

      const weightMap = new Map(
        ((weightsRes.data ?? []) as Array<{ section_id: string; weight_percent: number }>)
          .map((w) => [w.section_id, Number(w.weight_percent)])
      );
      const itemsBySection = new Map<string, Array<{ id: string; is_critical_blocker: boolean }>>();
      for (const item of (itemsRes.data ?? []) as Array<{ id: string; section_id: string; is_critical_blocker: boolean }>) {
        const arr = itemsBySection.get(item.section_id) ?? [];
        arr.push(item);
        itemsBySection.set(item.section_id, arr);
      }
      const docByItemId = new Map<string, string[]>();
      for (const doc of (docsRes.data ?? []) as Array<{ requirement_item_id: string | null; evidence_status: string }>) {
        if (!doc.requirement_item_id) continue;
        const arr = docByItemId.get(doc.requirement_item_id) ?? [];
        arr.push(doc.evidence_status);
        docByItemId.set(doc.requirement_item_id, arr);
      }
      function bestStatus(statuses: string[]): string {
        if (statuses.includes("accepted")) return "accepted";
        if (statuses.includes("under_review")) return "under_review";
        if (statuses.includes("submitted")) return "submitted";
        if (statuses.includes("needs_revision")) return "needs_revision";
        return "not_submitted";
      }
      supplierSectionProgress = ((rawSections ?? []) as Array<{ id: string; section_key: string; section_name: string; applies_to: string; sort_order: number }>)
        .map((section) => {
          const items = itemsBySection.get(section.id) ?? [];
          let accepted = 0, submitted = 0, under_review = 0, needs_revision = 0, missing = 0;
          let has_critical_blocker = false;
          for (const item of items) {
            const statuses = docByItemId.get(item.id) ?? [];
            const s = bestStatus(statuses);
            if (s === "accepted") accepted++;
            else if (s === "under_review") under_review++;
            else if (s === "submitted") submitted++;
            else if (s === "needs_revision") needs_revision++;
            else missing++;
            if (item.is_critical_blocker && s !== "accepted") has_critical_blocker = true;
          }
          return {
            section_key: section.section_key,
            section_name: section.section_name,
            applies_to: section.applies_to,
            weight_percent: weightMap.get(section.id) ?? 0,
            required_count: items.length,
            accepted_count: accepted,
            submitted_count: submitted,
            under_review_count: under_review,
            needs_revision_count: needs_revision,
            missing_count: missing,
            has_critical_blocker,
          } satisfies SectionProgress;
        });
    }
  }
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
  const onboardingSteps: OnboardingStep[] = workflowRows.length > 0
    ? workflowRows.map((step) => ({
        title: step.title,
        description: step.description,
        cta: { label: step.cta_label, href: step.cta_href }
      }))
    : STEPS.map((step) => ({
        title: step.label,
        description: "Complete this setup item to keep your workspace moving.",
        cta: { label: step.label, href: step.href }
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
  // For supplier role: count active linked suppliers
  let linkedSupplierCount = 0;
  if (isSupplier && profile?.supplier_id) {
    const { count } = await (supabase.from("exporter_supplier_links") as any)
      .select("id", { count: "exact", head: true })
      .eq("exporter_id", profile.supplier_id)
      .eq("status", "active") as unknown as { count: number | null };
    linkedSupplierCount = count ?? 0;
  }

  const metrics = isSupplier
    ? [
        { label: "My Suppliers",  value: String(linkedSupplierCount),  sublabel: "linked suppliers",    href: "/my-suppliers", tone: linkedSupplierCount > 0 ? "info" as const : "neutral" as const },
        { label: "My Evidence",   value: String(documentCount ?? 0),   sublabel: "documents submitted", href: "/my-evidence",  tone: (documentCount ?? 0) > 0 ? "info" as const : "neutral" as const },
        { label: "Action Items",  value: String(actionCount ?? 0),     sublabel: "open items",          href: "/my-requests",  tone: (actionCount ?? 0) > 0 ? "danger" as const : "success" as const },
      ]
    : [
        { label: "Suppliers",     value: String(supplierCount ?? 0),   sublabel: "on file",      href: "/suppliers",    tone: (supplierCount ?? 0) > 0 ? "info" as const : "neutral" as const },
        { label: "Evidence",      value: String(documentCount ?? 0),   sublabel: "uploaded",     href: "/evidence",     tone: (documentCount ?? 0) > 0 ? "info" as const : "neutral" as const },
        { label: "Open Actions",  value: String(actionCount ?? 0),     sublabel: "open",         href: "/gaps-actions", tone: (actionCount ?? 0) > 0 ? "danger" as const : "success" as const },
        { label: "Assessments",   value: String(assessmentCount ?? 0), sublabel: "completed",    href: "/readiness",    tone: (assessmentCount ?? 0) > 0 ? "success" as const : "neutral" as const },
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

  // Supplier: overall readiness pct from section progress
  const overallReadinessPct = supplierSectionProgress.length > 0
    ? Math.round(
        supplierSectionProgress.reduce((sum, s) => {
          const pct = s.required_count === 0 ? 0
            : s.accepted_count === 0 ? (s.submitted_count + s.under_review_count > 0 ? 25 : 0)
            : s.accepted_count < s.required_count ? 50
            : s.has_critical_blocker ? 75 : 100;
          return sum + (pct * s.weight_percent) / 100;
        }, 0)
      )
    : null;

  return (
    <AppShell role={role}>
      {showOnboarding && <OnboardingModal role={role} steps={onboardingSteps} />}

      {/* Greeting */}
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-ink">
              {profile?.organization_name || displayName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">Welcome back, {displayName}</p>
          </div>
          <StatusBadge tone={status === "active" ? "success" : "warning"}>{status}</StatusBadge>
        </div>
      </section>

      {/* Main two-column layout */}
      <div className="mt-4 grid gap-6 lg:grid-cols-[260px_1fr]">

        {/* Left: stat cards */}
        <div className="space-y-3">
          {metrics.map((m) => (
            <Link key={m.label} href={m.href} className="group flex items-center justify-between rounded-lg border border-line bg-white p-4 shadow-soft transition hover:border-forest">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 group-hover:text-forest">{m.label}</p>
                <p className="mt-1 text-xs text-slate-500">{m.sublabel}</p>
              </div>
              <p className="text-3xl font-semibold text-ink">{m.value}</p>
            </Link>
          ))}

          {/* Supplier: readiness score card */}
          {isSupplier && overallReadinessPct !== null && (
            <Link href="/my-evidence" className="group flex items-center justify-between rounded-lg border border-line bg-white p-4 shadow-soft transition hover:border-forest">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 group-hover:text-forest">Readiness Score</p>
                <p className="mt-1 text-xs text-slate-500">based on accepted evidence</p>
              </div>
              <p className={`text-3xl font-semibold ${
                overallReadinessPct >= 90 ? "text-emerald-600" :
                overallReadinessPct >= 75 ? "text-amber-600" :
                overallReadinessPct >= 50 ? "text-orange-500" : "text-red-500"
              }`}>{overallReadinessPct}%</p>
            </Link>
          )}
          {isSupplier && overallReadinessPct === null && (
            <Link href="/my-evidence" className="group flex items-center justify-between rounded-lg border border-line bg-white p-4 shadow-soft transition hover:border-forest">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 group-hover:text-forest">Readiness Score</p>
                <p className="mt-1 text-xs text-slate-500">based on accepted evidence</p>
              </div>
              <p className="text-3xl font-semibold text-red-500">0%</p>
            </Link>
          )}

          {/* Importer: FSVP record counts */}
          {isImporter && fsvpRecordCounts.total > 0 && (
            <div className="space-y-2">
              {[
                { label: "FSVP Approved",        value: fsvpRecordCounts.approved,       tone: "success" as StatusTone },
                { label: "Conditional",           value: fsvpRecordCounts.conditional,    tone: "warning" as StatusTone },
                { label: "Pending Review",        value: fsvpRecordCounts.pending,        tone: "info" as StatusTone },
                { label: "Reassessment Due",      value: fsvpRecordCounts.reassessmentDue, tone: fsvpRecordCounts.reassessmentDue > 0 ? "danger" as StatusTone : "neutral" as StatusTone },
              ].map((m) => (
                <Link key={m.label} href="/fsvp-records" className="group flex items-center justify-between rounded-lg border border-line bg-white px-4 py-3 shadow-soft transition hover:border-forest">
                  <p className="text-xs font-semibold text-slate-500 group-hover:text-forest">{m.label}</p>
                  <StatusBadge tone={m.tone}>{m.value}</StatusBadge>
                </Link>
              ))}
            </div>
          )}
          {isImporter && fsvpRecordCounts.total === 0 && (
            <Link href="/fsvp-records/new" className="flex items-center justify-between rounded-lg border border-dashed border-line bg-slate-50 px-4 py-3 text-sm text-slate-500 hover:border-forest hover:text-forest transition">
              <span>No FSVP records yet</span>
              <span className="text-xs font-semibold">Create one →</span>
            </Link>
          )}
        </div>

        {/* Right: activity + readiness sections */}
        <div className="space-y-6">
          <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <h2 className="text-base font-semibold text-ink">Recent Activity</h2>
            {activityItems.length === 0 ? (
              <div className="mt-4 flex flex-col items-center justify-center rounded-md border border-dashed border-line bg-slate-50 py-10 text-center">
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

          {isSupplier ? (
            <SupplierReadinessPanel supabase={supabase} title="My Readiness Checklist" showScore={false} />
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
