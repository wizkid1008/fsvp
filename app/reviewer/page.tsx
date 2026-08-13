import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EvidenceReviewPanel } from "@/components/evidence/EvidenceReviewPanel";
import { requireProfileRole } from "@/lib/auth/protection";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchReviewQueue, reviewQueueTotals } from "@/lib/evidence/review-queue";
import { isTenantConfined } from "@/lib/auth/tenancy";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

export default async function ReviewerPage() {
  const { role, realRole, user } = await requireProfileRole("/reviewer", ["reviewer", "administrator"]);

  // fetchReviewQueue has taken an importerId scope all along; this page passed
  // nothing, so it ran unscoped through the admin client. A reviewer holding an
  // importer_id is one tenant's qualified individual, not a platform-wide
  // reviewer (004_reviewer_tenancy.sql) — so every QI could read, and through
  // EvidenceReviewPanel act on, every other tenant's submitted evidence.
  const supabase = createServerSupabaseClient();
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const ownImporterId: string | null = profile?.importer_id ?? null;
  const confined = isTenantConfined({ role: realRole, importer_id: ownImporterId });

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
    // A confined caller with no importer_id would otherwise fall through to the
    // unscoped branch, so it resolves to a sentinel that matches nothing.
    items = await fetchReviewQueue(
      admin,
      confined ? (ownImporterId ?? "00000000-0000-0000-0000-000000000000") : null
    );
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
        description={confined
          ? "Evidence submitted by your organization's exporters. Accept documents that meet requirements, request revisions, or reject non-compliant submissions."
          : "Review submitted exporter evidence across all tenants. Accept documents that meet requirements, request revisions, or reject non-compliant submissions."}
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
