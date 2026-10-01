import Link from "next/link";

/**
 * "You are here, and this is what follows."
 *
 * Every list screen in the importer flow was a terminus: you added an
 * exporter and the page had nothing to say about facilities; you added a
 * facility and it had nothing to say about products. The app always knew — it
 * just wasn't on the screen you were standing on.
 *
 * The wording belongs to the caller, because the useful sentence is specific
 * ("a facility belongs to one exporter") rather than a generic "next step".
 *
 * There used to be a second, fixed button here — "See all steps" — to the
 * FSVP Pipeline page. That page is gone: why each product is unfinished is
 * now shown on the product itself (Products list and product page), so the
 * only button left is the caller's own action.
 */
export function NextStepBanner({
  children,
  action,
}: {
  /** The specific sentence for this screen. */
  children: React.ReactNode;
  /** Optional primary action, when a single destination fits the whole page. */
  action?: { label: string; href: string };
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-slate-50 px-5 py-4">
      <p className="max-w-3xl text-sm leading-6 text-slate-600">
        <span className="font-semibold text-ink">Next:</span> {children}
      </p>
      {action && (
        <Link
          href={action.href}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d]"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
