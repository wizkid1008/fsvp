import Link from "next/link";
import { AlertCircle, ArrowRight, Clock, ClipboardCheck, FileWarning } from "lucide-react";
import type { ImporterSignals } from "@/lib/dashboard/importer-signals";

/**
 * "What is blocking me?" for an importer.
 *
 * The importer dashboard was five count tiles while the exporter and
 * manufacturer dashboards both got a process flow, action items and open tasks
 * — so the party who actually owns the FSVP obligation had no task list at all.
 * This is the importer equivalent: everything that needs a decision, ordered by
 * how close it is to becoming a problem.
 *
 * The queries moved to lib/dashboard/importer-signals.ts so the tiles above can
 * read the same numbers rather than running a second, different set.
 */
export function ImporterActionsSection({ signals }: { signals: ImporterSignals }) {
  const { pendingReview, overdue, dueSoon, expiring, actions, drafts } = signals;

  const nothingToDo =
    pendingReview === 0 && overdue.length === 0 && dueSoon.length === 0 &&
    expiring.length === 0 && actions.length === 0 && drafts.length === 0;

  if (nothingToDo) return null;

  const Row = ({
    icon, tone, title, detail, href, cta,
  }: {
    icon: React.ReactNode; tone: string; title: string; detail: string; href: string; cta: string;
  }) => (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className={`shrink-0 ${tone}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{title}</p>
        <p className="truncate text-xs text-slate-500">{detail}</p>
      </div>
      <Link
        href={href}
        className="shrink-0 inline-flex h-7 items-center gap-1 rounded-md border border-forest px-2.5 text-xs font-semibold text-forest transition hover:bg-emerald-50"
      >
        {cta} <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Needs your attention</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Decisions and deadlines that are yours to action, soonest first.
        </p>
      </div>

      <div className="divide-y divide-line">
        {overdue.map((r) => (
          <Row
            key={`od-${r.id}`}
            icon={<AlertCircle className="h-4 w-4" />}
            tone="text-red-500"
            title={`Reassessment overdue — ${r.products_verify?.product_name ?? "record"}`}
            detail={`${r.suppliers?.company_name ?? "Supplier"} · was due ${new Date(r.reassessment_due_at).toLocaleDateString()}`}
            href={`/fsvp-records/${r.id}`}
            cta="Reassess"
          />
        ))}

        {pendingReview > 0 && (
          <Row
            icon={<ClipboardCheck className="h-4 w-4" />}
            tone="text-amber-500"
            title={`${pendingReview} document${pendingReview === 1 ? "" : "s"} awaiting your review`}
            detail="Submitted by your exporters and not yet accepted or rejected"
            href="/importer-review"
            cta="Review"
          />
        )}

        {actions.map((a) => (
          <Row
            key={`ca-${a.id}`}
            icon={<FileWarning className="h-4 w-4" />}
            tone="text-red-400"
            title={a.issue_description}
            detail={`${a.suppliers?.company_name ?? "Supplier"} · open since ${new Date(a.triggered_at).toLocaleDateString()}`}
            href="/gaps-actions"
            cta="Resolve"
          />
        ))}

        {expiring.map((d) => {
          const days = Math.ceil((new Date(d.expiration_date).getTime() - Date.now()) / 86400000);
          return (
            <Row
              key={`ex-${d.id}`}
              icon={<Clock className="h-4 w-4" />}
              tone={days <= 30 ? "text-red-500" : "text-amber-400"}
              title={`Expiring: ${d.title}`}
              detail={days < 0
                ? `Expired ${new Date(d.expiration_date).toLocaleDateString()}`
                : `${days} day${days === 1 ? "" : "s"} left · request a current version`}
              href="/importer-review"
              cta="Open"
            />
          );
        })}

        {dueSoon.map((r) => (
          <Row
            key={`ds-${r.id}`}
            icon={<Clock className="h-4 w-4" />}
            tone="text-amber-400"
            title={`Reassessment due — ${r.products_verify?.product_name ?? "record"}`}
            detail={`${r.suppliers?.company_name ?? "Supplier"} · due ${new Date(r.reassessment_due_at).toLocaleDateString()}`}
            href={`/fsvp-records/${r.id}`}
            cta="Open"
          />
        ))}

        {drafts.map((r) => (
          <Row
            key={`dr-${r.id}`}
            icon={<Clock className="h-4 w-4" />}
            tone="text-slate-300"
            title={`Draft record — ${r.products_verify?.product_name ?? "untitled"}`}
            detail={`${r.suppliers?.company_name ?? "Supplier"} · not yet documented or approved`}
            href={`/fsvp-records/${r.id}`}
            cta="Continue"
          />
        ))}
      </div>
    </section>
  );
}
