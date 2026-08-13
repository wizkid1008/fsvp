import Link from "next/link";

/**
 * "You are here, and this is what follows."
 *
 * Every list screen in the importer flow was a terminus: you added an
 * exporter and the page had nothing to say about facilities; you added a
 * facility and it had nothing to say about products. The app always knew —
 * /setup/fsvp could name the exact blocker — it just wasn't on the screen you
 * were standing on.
 *
 * The wording belongs to the caller, because the useful sentence is specific
 * ("a facility belongs to one exporter") rather than a generic "next step".
 * What is shared is that the thread never stops: every one of these links back
 * to the full path so the answer to "where am I?" is always one click away.
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
      <div className="flex shrink-0 flex-wrap gap-2">
        {action && (
          <Link
            href={action.href}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d]"
          >
            {action.label}
          </Link>
        )}
        <Link
          href="/setup/fsvp"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
        >
          See all steps
        </Link>
      </div>
    </div>
  );
}
