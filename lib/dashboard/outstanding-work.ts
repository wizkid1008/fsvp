/**
 * The whole book of outstanding work, one row per canonical gate.
 *
 * WHY THIS REPLACES "NEXT STEP · 4 OF 11"
 *
 * That card picked the first gate with any work outstanding and showed it as
 * the account's position. Two things were wrong with it.
 *
 * It was unreachable past step six. The selecting chain ran exporter →
 * facility → product → classification → admissibility → record → null, so
 * screening, evidence review, QI attestations, approval and the inspection
 * package could never be named — the card went quiet exactly when signing and
 * approval began, while a tile above it said two records were unsigned. The
 * "of 11" denominator described a list the mechanism could not walk.
 *
 * And it modelled a per-item pipeline as a global cursor. "Classify product"
 * was true of five products; the card showed one step, one button, and no way
 * to say that three products need classification while two need admissibility
 * and a record further along is stuck at QI. An account does not have a
 * position. Its items do.
 *
 * So every gate is listed, in the canonical order, each with a count of the
 * ITEMS that still need it. The first outstanding one keeps the emphasis the
 * old card had, which is the one thing it got right.
 */

import { FSVP_SETUP_STEPS, type FsvpSetupStepId } from "@/lib/setup/fsvp-steps";

export type WorkGate = {
  id: FsvpSetupStepId;
  title: string;
  /** The screen that does the work — where the action button goes. */
  href: string;
  /**
   * The same gate on /setup/fsvp, where its blockers are named per item.
   *
   * The dashboard row says "Classify product — 5 products"; the obvious next
   * question is WHICH five, and the pipeline page has already answered it with
   * a message and a fix button each. Without this the row sent people to
   * /products to work that out for themselves, and the two surfaces read as
   * rival lists rather than summary and detail.
   */
  detailHref: string;
  actionLabel: string;
  /** How many items still need this gate. */
  count: number;
  /** What the count counts, singular — "product", "record", "supplier". */
  unit: string;
  /**
   * A one-off setup step rather than a per-item gate. Counted 1 or 0, and
   * phrased as done/not done rather than as a number of things.
   */
  setup: boolean;
  /**
   * Work that is available rather than outstanding — generating an inspection
   * package is something you MAY do for an approved record, not something
   * overdue. Kept out of the "what is blocking me" tally.
   */
  optional: boolean;
};

export type WorkInputs = {
  exporterCount: number;
  facilityCount: number;
  productCount: number;
  /** Products missing a commodity or a country of origin. */
  unclassifiedProducts: number;
  /** Products missing classification, origin OR a current admissibility determination. */
  referenceGapCount: number;
  /** Products with no live FSVP applicability determination. */
  undeterminedPairs: number;
  /** Linked suppliers with no current compliance-history screening. */
  screeningBlockCount: number;
  /** Exporter submissions waiting on the importer. */
  pendingReview: number;
  /** Pre-approval records carrying no qualified individual signature. */
  unsignedRecords: number;
  /** Records sitting at importer review. */
  recordsInReview: number;
  /** Records approved and in monitoring. */
  approvedRecords: number;
};

function step(id: FsvpSetupStepId) {
  const found = FSVP_SETUP_STEPS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown FSVP setup step: ${id}`);
  return found;
}

export function outstandingWork(input: WorkInputs): WorkGate[] {
  // Products carrying a classification gap are already counted at the
  // classification gate, and referenceGapCount is a superset of them. Showing
  // the raw superset here would count the same product at two gates and invite
  // someone to "fix" admissibility on a product that cannot have one yet.
  // Clamped because the two counts come from different queries and a race
  // between them must not produce a negative.
  const admissibilityOnly = Math.max(0, input.referenceGapCount - input.unclassifiedProducts);

  const rows: Array<[FsvpSetupStepId, number, string, boolean, boolean]> = [
    ["exporter",       input.exporterCount === 0 ? 1 : 0, "exporter",   true,  false],
    ["facility",       input.facilityCount === 0 ? 1 : 0, "facility",   true,  false],
    ["product",        input.productCount === 0 ? 1 : 0,  "product",    true,  false],
    ["classification", input.unclassifiedProducts,        "product",    false, false],
    ["admissibility",  admissibilityOnly,                 "product",    false, false],
    ["record",         input.undeterminedPairs,           "product",    false, false],
    ["screening",      input.screeningBlockCount,         "supplier",   false, false],
    ["evidence",       input.pendingReview,               "submission", false, false],
    ["qi",             input.unsignedRecords,             "record",     false, false],
    ["approval",       input.recordsInReview,             "record",     false, false],
    ["package",        input.approvedRecords,             "record",     false, true ],
  ];

  return rows.map(([id, count, unit, setup, optional]) => {
    const copy = step(id);
    return {
      id,
      title: copy.title,
      href: copy.href,
      // Matches the `id={`gate-${step.id}`}` anchors on /setup/fsvp.
      detailHref: `/setup/fsvp#gate-${id}`,
      actionLabel: copy.actionLabel,
      count,
      unit,
      setup,
      optional,
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
