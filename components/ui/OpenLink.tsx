import { ArrowRight } from "lucide-react";

/**
 * The one row action on the exporter, facility and product lists. Editing
 * happens on the page it opens — one place per entity — rather than in a
 * second form reached from the list.
 */
export function OpenLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      aria-label={`Open ${label}`}
      className="inline-flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-semibold text-slate-600 transition hover:border-forest hover:text-forest"
    >
      Open
      <ArrowRight className="h-3.5 w-3.5" />
    </a>
  );
}
