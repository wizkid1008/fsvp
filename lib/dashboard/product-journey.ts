/**
 * A product's journey, as five phases over the eleven gates.
 *
 * The dashboard reported records: "0 of 2 records approved". The gate list
 * beside it reported products: "5 products need classification". Two
 * denominators on one screen with the join never stated, so the two sections
 * read as contradicting each other when they were only counting different
 * things. The product is the unit an importer thinks in, so the product is
 * what the status counts now.
 *
 * Five phases rather than eleven, because this is the overview — the eleven
 * gates are the worklist beside it, and repeating them here at a second
 * granularity is exactly the duplication that made the old dashboard
 * unreadable. Each phase is a contiguous run of gates, so a product's phase
 * can never disagree with the gate it is counted under.
 */

import type { FsvpSetupStepId } from "@/lib/setup/fsvp-steps";
import type { ProductStanding } from "@/lib/setup/fsvp-workflow";

export const PRODUCT_PHASES = [
  {
    key: "registering",
    label: "Registering",
    gates: ["exporter", "facility", "product", "classification", "admissibility"],
  },
  { key: "record", label: "Opening record", gates: ["record"] },
  { key: "verifying", label: "Verifying", gates: ["screening", "evidence", "qi"] },
  { key: "approval", label: "Awaiting approval", gates: ["approval"] },
  // A product with only its inspection package outstanding is approved and
  // importable; generating the package is something you may do when FDA asks.
  { key: "approved", label: "Approved", gates: ["package"] },
] as const;

/** Statuses that mean a product's record has stopped rather than progressed. */
const BLOCKED_RECORD_STATUSES = ["needs_corrective_action", "rejected", "expired"];

export type ProductPhase = {
  index: number;
  key: string;
  label: string;
};

/** Which phase a standing sits in. A finished product reports the last one. */
export function phaseFor(standing: ProductStanding): ProductPhase {
  if (standing.gateId === null) {
    const last = PRODUCT_PHASES.length - 1;
    return { index: last, key: PRODUCT_PHASES[last].key, label: PRODUCT_PHASES[last].label };
  }

  const index = PRODUCT_PHASES.findIndex((p) =>
    (p.gates as readonly string[]).includes(standing.gateId as FsvpSetupStepId)
  );
  // An unrecognised gate starts at the beginning rather than reporting done,
  // which would be the most reassuring possible wrong answer.
  const safe = index === -1 ? 0 : index;
  return { index: safe, key: PRODUCT_PHASES[safe].key, label: PRODUCT_PHASES[safe].label };
}

export function isBlockedStanding(standing: ProductStanding): boolean {
  return standing.recordStatus !== null && BLOCKED_RECORD_STATUSES.includes(standing.recordStatus);
}

export type ProductSummary = {
  total: number;
  /** Products whose record has stopped. Excluded from the phase counts. */
  blocked: number;
  /** One count per entry in PRODUCT_PHASES. */
  byPhase: number[];
  /** Products through every gate that gates importability. */
  approved: number;
};

export function summariseProducts(standings: ProductStanding[]): ProductSummary {
  const byPhase = PRODUCT_PHASES.map(() => 0);
  let blocked = 0;

  for (const standing of standings) {
    if (isBlockedStanding(standing)) {
      blocked += 1;
      continue;
    }
    byPhase[phaseFor(standing).index] += 1;
  }

  return {
    total: standings.length,
    blocked,
    byPhase,
    approved: byPhase[PRODUCT_PHASES.length - 1],
  };
}
