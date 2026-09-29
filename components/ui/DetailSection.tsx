import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";

/**
 * One section of an exporter, facility or product page: a title, whether it is
 * done, one action, and its contents. Every detail page is built from these so
 * the three levels read the same — see the product page for the pattern.
 *
 * `done` null means the section has no done/not-done state (Documents, say,
 * which carries its own counts).
 *
 * No hooks, so it renders on the server; `action` is usually a small client
 * button that opens an edit form.
 */
export function DetailSection({
  id,
  title,
  done = null,
  hint,
  action,
  children,
}: {
  id?: string;
  title: string;
  done?: boolean | null;
  /** Shown beside the title when not done — what is missing, in a few words. */
  hint?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 rounded-lg border bg-white p-5 shadow-soft ${done === false ? "border-amber-300" : "border-line"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          {done === true && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Complete" />}
          {done === false && <AlertCircle className="h-4 w-4 text-amber-600" aria-label="Needs attention" />}
          {title}
          {done === false && hint && <span className="text-sm font-normal text-amber-700">— {hint}</span>}
        </h2>
        {action}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

/**
 * What an exporter or facility contains — facilities, products — as links to
 * their own pages, each one level further down the same drill-down.
 */
export function ChildList({ items }: { items: Array<{ href: string; name: string; detail?: string }> }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
      {items.map((item) => (
        <li key={item.href}>
          <a href={item.href} className="group flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
            <span className="font-medium text-forest underline-offset-2 group-hover:underline">{item.name}</span>
            <span className="flex items-center gap-2 text-xs text-slate-500">
              {item.detail}
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Label/value pairs inside a DetailSection. */
export function DetailFacts({ facts }: { facts: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{fact.label}</dt>
          <dd className="mt-1 font-medium text-ink">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
