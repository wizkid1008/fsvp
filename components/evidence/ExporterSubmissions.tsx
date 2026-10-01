import { EvidenceReviewPanel } from "@/components/evidence/EvidenceReviewPanel";
import { fetchReviewQueue, reviewQueueTotals } from "@/lib/evidence/review-queue";
import type { StatusTone } from "@/types/platform";

/**
 * Evidence exporters have submitted and are waiting on the importer, as the
 * Exporter submissions tab of the Document Library.
 *
 * This was its own page, /importer-review, beside the library — which already
 * said "documents your exporters submit for review arrive in Exporter
 * Submissions", pointing next door for half of the same documents. It is a tab
 * of the library now; /importer-review redirects here so notification links
 * already sent keep working.
 */
export async function ExporterSubmissions({
  admin,
  importerId,
}: {
  admin: Parameters<typeof fetchReviewQueue>[0];
  /** Null for an administrator not previewing an importer: every submission. */
  importerId: string | null;
}) {
  const items = await fetchReviewQueue(admin, importerId);
  const { pendingTotal, criticalTotal, acceptedTotal } = reviewQueueTotals(items);
  const revisionTotal = items.filter((item) => item.evidence_status === "needs_revision").length;
  const expiringTotal = items.filter((item) =>
    item.expiration_date &&
    item.expiration_date <= new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)
  ).length;

  const metricTone = (v: number, warnAbove = 0): StatusTone =>
    v === 0 ? "neutral" : v > warnAbove ? "warning" : "success";

  return (
    <div>
      <p className="max-w-3xl text-sm leading-6 text-slate-600">
        Evidence your exporters have submitted and are waiting on you. Accept compliant documents,
        request revisions, or reject non-compliant submissions.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-5">
        {[
          { label: "Pending Review",    value: pendingTotal,  tone: metricTone(pendingTotal, 0) },
          { label: "Critical Blockers", value: criticalTotal, tone: criticalTotal > 0 ? "danger" : "neutral" },
          { label: "Revision Requests", value: revisionTotal, tone: revisionTotal > 0 ? "warning" : "neutral" },
          { label: "Expiring Soon",     value: expiringTotal, tone: expiringTotal > 0 ? "warning" : "neutral" },
          { label: "Accepted",          value: acceptedTotal, tone: "success" },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <p className="text-xs font-medium text-slate-500">{m.label}</p>
            <div className="mt-2 flex items-end justify-between">
              <p className={`text-3xl font-semibold ${m.value > 0 && m.tone === "danger" ? "text-red-700" : m.value > 0 && m.tone === "warning" ? "text-amber-700" : "text-ink"}`}>{m.value}</p>
            </div>
          </div>
        ))}
      </div>

      <EvidenceReviewPanel items={items as any} />
    </div>
  );
}
