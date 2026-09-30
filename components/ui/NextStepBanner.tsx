import Link from "next/link";
import { FSVP_SETUP_STEPS, type FsvpSetupStepId } from "@/lib/setup/fsvp-steps";

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
 *
 * That link used to say "See all steps" and land at the top of a page titled
 * FSVP Pipeline, with nothing tying it to the screen you left. It now names the
 * page it opens and, when the caller passes `stage`, which stage of it this
 * screen is — and lands on that stage rather than the top.
 */
export function NextStepBanner({
  children,
  action,
  stage,
}: {
  /** The specific sentence for this screen. */
  children: React.ReactNode;
  /** Optional primary action, when a single destination fits the whole page. */
  action?: { label: string; href: string };
  /** The pipeline stage this screen clears, so the link can land on it. */
  stage?: FsvpSetupStepId;
}) {
  const stageNumber = stage ? FSVP_SETUP_STEPS.findIndex((step) => step.id === stage) + 1 : 0;

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
          href={stage ? `/setup/fsvp#gate-${stage}` : "/setup/fsvp"}
          title="Every stage a product and its FSVP record pass through, and what is blocking each"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
        >
          {stageNumber > 0
            ? `FSVP Pipeline · stage ${stageNumber} of ${FSVP_SETUP_STEPS.length}`
            : "FSVP Pipeline"}
        </Link>
      </div>
    </div>
  );
}
