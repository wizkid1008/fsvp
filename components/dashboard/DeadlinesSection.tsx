import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * "Deadlines and reviews": one row per thing with a clock on it, each with the
 * button that deals with it. Shared by the importer's dashboard
 * (ImporterActionsSection) and the exporter's and supplier's
 * (ExporterDashboard), so the two read the same way.
 */
export function DeadlinesSection({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Deadlines and reviews</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Decisions and deadlines that are yours to action, soonest first.
        </p>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

export function DeadlineRow({
  icon,
  tone,
  title,
  detail,
  href,
  cta,
  children,
}: {
  icon: React.ReactNode;
  /** Text colour class for the icon, e.g. text-red-500. */
  tone: string;
  title: string;
  detail: string;
  href?: string;
  cta?: string;
  /** Anything to show under the row — the exporter's response box, for one. */
  children?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-3">
      <div className="flex items-center gap-3">
        <span className={`shrink-0 ${tone}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{title}</p>
          <p className="truncate text-xs text-slate-500">{detail}</p>
        </div>
        {href && cta && (
          <Link
            href={href}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-forest px-2.5 text-xs font-semibold text-forest transition hover:bg-emerald-50"
          >
            {cta} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children && <div className="mt-2 pl-7">{children}</div>}
    </div>
  );
}
