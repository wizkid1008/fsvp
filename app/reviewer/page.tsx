import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EvidenceReviewPanel } from "@/components/evidence/EvidenceReviewPanel";
import { requireProfileRole } from "@/lib/auth/protection";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { fetchReviewQueue, reviewQueueTotals } from "@/lib/evidence/review-queue";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

export default async function ReviewerPage() {
  const { role, realRole } = await requireProfileRole("/reviewer", ["reviewer", "administrator"]);

  // The queue is an operational screen. When it fails, a reviewer needs to know
  // WHAT failed — Next strips `error.message` from server errors in production
  // and hands the boundary only a digest, so the real reason is otherwise
  // reachable only from Cloudflare's deployment logs. That is a poor place to
  // keep the answer to "why is the review queue down".
  //
  // The client construction is INSIDE the try on purpose: it throws when
  // SUPABASE_SERVICE_ROLE_KEY is missing at request time, and that throw is the
  // one most likely to take this page down — a misconfigured deployment, not a
  // bug. The previous version wrapped only the query and so never caught it.
  let items: Awaited<ReturnType<typeof fetchReviewQueue>> = [];
  let loadError: string | null = null;

  try {
    const admin = createAdminSupabaseClient();
    items = await fetchReviewQueue(admin);
  } catch (err) {
    // redirect() and notFound() signal themselves by throwing. Swallowing them
    // would turn "send this user to the login page" into "show them an error".
    if (err && typeof err === "object" && "digest" in err &&
        typeof (err as { digest?: unknown }).digest === "string" &&
        (err as { digest: string }).digest.startsWith("NEXT_")) {
      throw err;
    }
    loadError = err instanceof Error ? err.message : String(err);
  }

  const { pendingTotal, criticalTotal, acceptedTotal } = reviewQueueTotals(items);

  const metricTone = (v: number, warnAbove = 0): StatusTone =>
    v === 0 ? "neutral" : v > warnAbove ? "warning" : "success";

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Evidence Review Queue"
        description="Review submitted supplier evidence, accept documents that meet requirements, request revisions, or reject non-compliant submissions."
      />

      {loadError && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">The review queue could not be loaded.</p>
          <p className="mt-2 rounded border border-red-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-red-900">
            {loadError}
          </p>
          {loadError.includes("SUPABASE_SERVICE_ROLE_KEY") && (
            <p className="mt-2 leading-relaxed">
              This is a deployment configuration problem, not a fault in the data. The service-role
              key is read at request time, so it has to be available to the running Pages Function —
              not only to the build. Every page that reads across tenants is affected the same way.
            </p>
          )}
          <p className="mt-2 text-xs">
            The counts below read zero because nothing loaded — that is not a statement that there
            is nothing to review.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Pending Review",       value: pendingTotal,  tone: metricTone(pendingTotal, 0) as StatusTone },
          { label: "Critical Blockers",    value: criticalTotal, tone: criticalTotal > 0 ? ("danger" as StatusTone) : ("neutral" as StatusTone) },
          { label: "Accepted (visible)",   value: acceptedTotal, tone: "success" as StatusTone },
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
