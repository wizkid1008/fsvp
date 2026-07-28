import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EvidenceReviewPanel } from "@/components/evidence/EvidenceReviewPanel";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { fetchReviewQueue, reviewQueueTotals } from "@/lib/evidence/review-queue";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

export default async function ImporterReviewPage() {
  const { role, realRole, user } = await requireProfileRole("/importer-review", ["us_importer", "administrator"]);
  const supabase = createServerSupabaseClient();
  const admin = createAdminSupabaseClient();

  // Get the importer's own ID so we can scope everything to their suppliers
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const importerId: string | null = resolvePreviewedAccountId(realRole, profile?.importer_id ?? null);

  // Administrators can see everything; importers are scoped to their importer_id
  const items = await fetchReviewQueue(admin, role === "us_importer" ? importerId : null);
  const { pendingTotal, criticalTotal, acceptedTotal } = reviewQueueTotals(items);

  const metricTone = (v: number, warnAbove = 0): StatusTone =>
    v === 0 ? "neutral" : v > warnAbove ? "warning" : "success";

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Supplier Review Queue"
        description="Review evidence submitted by your suppliers. Accept compliant documents, request revisions, or reject non-compliant submissions."
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Pending Review",    value: pendingTotal,  tone: metricTone(pendingTotal, 0) as StatusTone },
          { label: "Critical Blockers", value: criticalTotal, tone: criticalTotal > 0 ? ("danger" as StatusTone) : ("neutral" as StatusTone) },
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
