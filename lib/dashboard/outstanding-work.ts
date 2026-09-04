/**
 * The whole book of outstanding work, one row per canonical gate.
 *
 * WHY THIS READS THE PIPELINE PLANNER
 *
 * It used to compute its own counts from fetchImporterSignals, while
 * /setup/fsvp computed the same eleven gates from loadCompleteFsvpSetupPlan.
 * Two query sets, two definitions, one name each — and they disagreed in front
 * of the user. The dashboard said "Create product — Done" (is there at least
 * one product?) while the pipeline said "1 blocker — Cocoa Powder is missing
 * its facility link" (does every product have its exporter and facility?), and
 * the dashboard row linked to the pipeline row contradicting it. The totals
 * disagreed too: 5 of 11 gates outstanding against 8 of 11 stages blocked.
 *
 * So there is one source now. The planner does the deep per-item validation
 * and owns what "outstanding" means; this maps its stages into dashboard rows
 * and adds nothing of its own. The two surfaces cannot drift because there is
 * no second opinion to drift from.
 *
 * WHY IT REPLACED "NEXT STEP · 4 OF 11"
 *
 * That card picked the first gate with work and showed it as the account's
 * position. It could not reach past step six — screening, evidence review, QI
 * attestations, approval and the inspection package were unreachable, so it
 * went quiet exactly when signing and approval began. And it modelled a
 * per-item pipeline as a global cursor: "Classify product" was true of five
 * products, with no way to say that three need classification while two need
 * admissibility and a record further on is stuck at QI. An account does not
 * have a position. Its items do.
 */

import { isOnboardingStep } from "@/lib/setup/fsvp-steps";
import type { FsvpSetupStepId } from "@/lib/setup/fsvp-steps";
// Type-only: erased at compile time, so the dashboard does not pull the
// planner's query layer into any bundle that only needs the shape.
import type { SetupStep } from "@/lib/setup/fsvp-workflow";

/**
 * What each stage counts, singular.
 *
 * Taken from the planner's own progress units rather than assumed — the
 * facility stage counts EXPORTERS that have a facility, not facilities, and
 * the later stages count records. `null` means the unit cannot be named
 * honestly: the QI stage's total is `1 + records` (one slot for whether the
 * register has an active qualified individual at all, then one per record), so
 * calling its outstanding count a number of records would be wrong whenever
 * the register is the thing missing.
 */
const STAGE_UNITS: Record<string, string | null> = {
  exporter:       "exporter",
  facility:       "exporter",
  product:        "product",
  classification: "product",
  admissibility:  "product",
  record:         "product",
  screening:      "record",
  evidence:       "record",
  qi:             null,
  approval:       "record",
  package:        "approved record",
};

export type WorkGate = {
  id: FsvpSetupStepId;
  /**
   * The screen that does the work — where the action button goes. Collapses to
   * the single item when this stage has only one destination; see below.
   */
  title: string;
  href: string;
  /**
   * Where the row goes.
   *
   * Normally the same gate on /setup/fsvp, where its blockers are named per
   * item: the row says "Classify product — 5 products", the obvious next
   * question is WHICH five, and the pipeline has already answered it with a
   * message and a fix button each.
   *
   * But when every blocker at the stage points at the SAME screen, the pipeline
   * has nothing left to disambiguate — it would show one blocker whose button
   * goes exactly where the reader already asked to go. The row said "1 product",
   * so it knows which product; sending them to a stage listing to click again is
   * making them re-derive an answer the system already had. So in that case the
   * row goes straight there.
   */
  detailHref: string;
  actionLabel: string;
  /** Items at this stage that are not yet done. */
  count: number;
  /** Named blockers the pipeline can show for this stage. */
  blockers: number;
  /** What `count` counts, singular. Null when it cannot be named honestly. */
  unit: string | null;
  /**
   * One of the three gates that genuinely finish. Until the account holds one
   * exporter, one facility and one product nothing downstream can happen;
   * after that these keep only their per-item blockers.
   */
  setup: boolean;
  /**
   * Work that is available rather than outstanding — generating an inspection
   * package is something you MAY do for an approved record, not something
   * overdue. Kept out of the "what is blocking me" tally.
   */
  optional: boolean;
};

export function outstandingWork(steps: SetupStep[]): WorkGate[] {
  return steps.map((step) => {
    /**
     * Where this stage's blockers actually point.
     *
     * Comparing DESTINATIONS rather than counting blockers is what makes this
     * right in both awkward cases. One product carrying two blockers still has
     * one destination, so the row should go to it. Five products carrying one
     * blocker each have five, so the row must go to the pipeline where they are
     * named. Counting blockers would get the first case wrong.
     */
    const destinations = new Set(step.blockers.map((blocker) => blocker.href));
    const labels = new Set(step.blockers.map((blocker) => blocker.actionLabel));
    const onlyDestination = destinations.size === 1 ? [...destinations][0] : null;

    return {
      id: step.id as FsvpSetupStepId,
      title: step.title,
      href: onlyDestination ?? step.href,
      // Matches the `id={`gate-${step.id}`}` anchors on /setup/fsvp.
      detailHref: onlyDestination ?? `/setup/fsvp#gate-${step.id}`,
      // The blocker's own label is the more specific one ("Classify product"
      // over "Review classifications"), but only when the blockers agree.
      actionLabel: onlyDestination && labels.size === 1 ? [...labels][0] : step.actionLabel,
      // Items outstanding, not blockers: one product can carry two blockers, and
      // "2 products" when there is one product with two problems would overstate
      // how much is left. The blocker count travels alongside for the pipeline.
      count: Math.max(0, step.progress.total - step.progress.done),
      blockers: step.blockers.length,
      unit: STAGE_UNITS[step.id] ?? null,
      setup: isOnboardingStep(step.id),
      optional: step.id === "package",
    };
  });
}

/** The first gate with work outstanding — what the old card called next step. */
export function firstOutstanding(gates: WorkGate[]): WorkGate | null {
  return gates.find((g) => !g.optional && g.count > 0) ?? null;
}

/** How many gates still have work, ignoring the optional ones. */
export function outstandingCount(gates: WorkGate[]): number {
  return gates.filter((g) => !g.optional && g.count > 0).length;
}
