import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EvidenceReviewPanel } from "@/components/evidence/EvidenceReviewPanel";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import { ConfigurationNotice } from "@/components/ui/ConfigurationNotice";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { fetchReviewQueue, reviewQueueTotals } from "@/lib/evidence/review-queue";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

export default async function ImporterReviewPage() {
  const { role, realRole, user } = await requireProfileRole("/importer-review", ["us_importer", "administrator"]);
  const supabase = createServerSupabaseClient();

  const adminResult = tryAdminClient();
  if (!adminResult.ok) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader title="Supplier Submissions" description="" />
        <ConfigurationNotice message={adminResult.message} />
      </AppShell>
    );
  }
  const admin = adminResult.client;

  // Get the importer's own ID so we can scope everything to their suppliers
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const importerId: string | null = resolvePreviewedAccountId(realRole, profile?.importer_id ?? null);

  // Administrators can see everything; importers are scoped to their importer_id
  const items = await fetchReviewQueue(admin, role === "us_importer" ? importerId : null);
  const { pendingTotal, criticalTotal, acceptedTotal } = reviewQueueTotals(items);
  const revisionTotal = items.filter((item) => item.evidence_status === "needs_revision").length;
  const expiringTotal = items.filter((item) =>
    item.expiration_date &&
    item.expiration_date <= new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)
  ).length;

  const metricTone = (v: number, warnAbove = 0): StatusTone =>
    v === 0 ? "neutral" : v > warnAbove ? "warning" : "success";

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Supplier Submissions"
        description="Evidence your exporters have submitted and are waiting on you. Accept compliant documents, request revisions, or reject non-compliant submissions. Everything you have already accepted lives in the Document Library."
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-5">
        {[
          { label: "Pending Review",    value: pendingTotal,  tone: metricTone(pendingTotal, 0) as StatusTone },
          { label: "Critical Blockers", value: criticalTotal, tone: criticalTotal > 0 ? ("danger" as StatusTone) : ("neutral" as StatusTone) },
          { label: "Revision Requests", value: revisionTotal, tone: revisionTotal > 0 ? ("warning" as StatusTone) : ("neutral" as StatusTone) },
          { label: "Expiring Soon",     value: expiringTotal, tone: expiringTotal > 0 ? ("warning" as StatusTone) : ("neutral" as StatusTone) },
          { label: "Accepted",          value: acceptedTotal, tone: "success" as StatusTone },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <p className="text-xs font-medium text-slate-500">{m.label}</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-3xl font-semibold text-ink">{m.value}</p>
              <StatusBadge tone={m.tone}>{m.value > 0 ? "Active" : "None"}</StatusBadge>
            </div>
          </div>
        ))}
      </div>

      <EvidenceReviewPanel items={items as any} />
    </AppShell>
  );
}
