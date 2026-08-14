/**
 * Whether a food is actually imported, and what follows from the answer.
 *
 * FSVP applies to food an importer imports. A product row that was created
 * speculatively, or one no longer sourced, carries no obligation — but the
 * platform had no way to say so, so every such row sat in the setup path
 * demanding a fix that would never be appropriate.
 *
 * Deleting is not the alternative. § 1.510 requires records kept for two years
 * after an importer stops importing from a supplier, so a product that was once
 * imported has to survive even once it stops being work. That is why
 * "discontinued" and "not imported" are different states rather than one
 * "inactive": only the first attracted an obligation, and only the first has
 * anything to retain.
 */

export type ProductLifecycle = "active" | "not_imported" | "discontinued";

/** 21 CFR 1.510(b)(1) — two years after the importer stops importing. */
export const RETENTION_YEARS = 2;

export type LifecycleInput = {
  lifecycle: ProductLifecycle;
  discontinuedOn: string | null;
};

/** Does this product carry an FSVP obligation, and therefore appear as work? */
export function isOutstandingWork(product: LifecycleInput): boolean {
  return product.lifecycle === "active";
}

/**
 * The date this product's records may be disposed of, or null if never.
 *
 * Active products have no end date — the obligation is live. A product that was
 * never imported never attracted one, so nothing is being retained and there is
 * nothing to count down.
 */
export function retentionEndsOn(product: LifecycleInput): string | null {
  if (product.lifecycle !== "discontinued" || !product.discontinuedOn) return null;

  const stopped = new Date(`${product.discontinuedOn.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(stopped.getTime())) return null;

  stopped.setUTCFullYear(stopped.getUTCFullYear() + RETENTION_YEARS);
  return stopped.toISOString().slice(0, 10);
}

/** Records still inside their retention period must not be disposed of. */
export function isWithinRetention(
  product: LifecycleInput,
  on: string = new Date().toISOString().slice(0, 10)
): boolean {
  const ends = retentionEndsOn(product);
  if (!ends) return product.lifecycle === "active";
  return on.slice(0, 10) <= ends;
}

export type TransitionRefusal = { ok: false; reason: string };
export type TransitionOk = { ok: true; discontinuedOn: string | null };
export type TransitionResult = TransitionOk | TransitionRefusal;

/**
 * Validate a lifecycle change before it is written.
 *
 * `everImported` is the question the platform cannot answer for itself — a
 * product may have been imported long before this system existed. Marking
 * something "never imported" when it was is the one change here that destroys
 * a record FSVP requires, so it is refused when the caller says otherwise.
 */
export function planTransition(input: {
  from: ProductLifecycle;
  to: ProductLifecycle;
  discontinuedOn?: string | null;
  everImported: boolean;
  today?: string;
}): TransitionResult {
  const today = (input.today ?? new Date().toISOString().slice(0, 10)).slice(0, 10);

  if (input.from === input.to) {
    return { ok: false, reason: "This product is already in that state." };
  }

  if (input.to === "not_imported") {
    if (input.everImported) {
      return {
        ok: false,
        reason:
          "This food has been imported, so it cannot be marked as never imported. Mark it " +
          "discontinued instead — 21 CFR 1.510 requires its records for two years after you " +
          "stopped importing it.",
      };
    }
    return { ok: true, discontinuedOn: null };
  }

  if (input.to === "discontinued") {
    const stopped = (input.discontinuedOn ?? "").slice(0, 10);
    if (!stopped) {
      return {
        ok: false,
        reason:
          "Record the date you stopped importing this food. The two-year retention period runs " +
          "from that date, not from today.",
      };
    }
    if (stopped > today) {
      return {
        ok: false,
        reason: "The date you stopped importing cannot be in the future.",
      };
    }
    return { ok: true, discontinuedOn: stopped };
  }

  // Back to active — resuming import. The retention clock is abandoned because
  // the obligation is live again.
  return { ok: true, discontinuedOn: null };
}

export const LIFECYCLE_LABEL: Record<ProductLifecycle, string> = {
  active:        "Imported",
  not_imported:  "Not imported",
  discontinued:  "Discontinued",
};

export function lifecycleExplanation(product: LifecycleInput): string {
  switch (product.lifecycle) {
    case "active":
      return "This food is imported, so the full FSVP obligation applies to it.";
    case "not_imported":
      return "This food has never been imported, so no FSVP obligation attached to it and it is not counted as outstanding work.";
    case "discontinued": {
      const ends = retentionEndsOn(product);
      return ends
        ? `Importing stopped on ${product.discontinuedOn}. Its records are retained until ${ends} under 21 CFR 1.510 and cannot be disposed of before then.`
        : "Importing has stopped. Its records are retained under 21 CFR 1.510.";
    }
  }
}
