import { describe, expect, it } from "vitest";
import { FSVP_SETUP_STEPS } from "@/lib/setup/fsvp-steps";
import {
  firstOutstanding,
  outstandingCount,
  outstandingWork,
  type WorkInputs,
} from "./outstanding-work";

/** A fully set-up account with nothing outstanding. */
function input(over: Partial<WorkInputs> = {}): WorkInputs {
  return {
    exporterCount: 1,
    facilityCount: 1,
    productCount: 5,
    unclassifiedProducts: 0,
    referenceGapCount: 0,
    undeterminedPairs: 0,
    screeningBlockCount: 0,
    pendingReview: 0,
    unsignedRecords: 0,
    recordsInReview: 0,
    approvedRecords: 0,
    ...over,
  };
}

describe("outstandingWork", () => {
  it("covers every canonical step, in order", () => {
    // The card this replaces could only ever reach six of the eleven, so the
    // "of 11" it printed described a list it could not walk.
    const gates = outstandingWork(input());
    expect(gates.map((g) => g.id)).toEqual(FSVP_SETUP_STEPS.map((s) => s.id));
  });

  it("reaches the steps the old next-step chain could not", () => {
    const gates = outstandingWork(input({ unsignedRecords: 2, recordsInReview: 1, screeningBlockCount: 3 }));
    const byId = Object.fromEntries(gates.map((g) => [g.id, g.count]));

    expect(byId.screening).toBe(3);
    expect(byId.qi).toBe(2);
    expect(byId.approval).toBe(1);
  });

  it("counts items rather than reporting one position for the account", () => {
    const gates = outstandingWork(input({ unclassifiedProducts: 3, unsignedRecords: 2 }));
    const byId = Object.fromEntries(gates.map((g) => [g.id, g.count]));

    // Both are true at once. The old card could only say one of them.
    expect(byId.classification).toBe(3);
    expect(byId.qi).toBe(2);
  });

  it("does not count a product at both classification and admissibility", () => {
    // referenceGapCount is a superset of the unclassified ones. Showing it raw
    // would ask someone to fix admissibility on a product that cannot have one
    // until it is classified.
    const gates = outstandingWork(input({ unclassifiedProducts: 5, referenceGapCount: 5 }));
    const byId = Object.fromEntries(gates.map((g) => [g.id, g.count]));

    expect(byId.classification).toBe(5);
    expect(byId.admissibility).toBe(0);
  });

  it("shows admissibility for products that are classified but undetermined", () => {
    const gates = outstandingWork(input({ unclassifiedProducts: 2, referenceGapCount: 5 }));
    expect(gates.find((g) => g.id === "admissibility")?.count).toBe(3);
  });

  it("never reports a negative count when the two queries disagree", () => {
    const gates = outstandingWork(input({ unclassifiedProducts: 5, referenceGapCount: 2 }));
    expect(gates.find((g) => g.id === "admissibility")?.count).toBe(0);
  });

  it("treats the first three steps as one-off setup, not as item counts", () => {
    const gates = outstandingWork(input({ exporterCount: 0, facilityCount: 0, productCount: 0 }));
    for (const id of ["exporter", "facility", "product"]) {
      const gate = gates.find((g) => g.id === id);
      expect(gate?.setup).toBe(true);
      expect(gate?.count).toBe(1);
    }
  });

  it("counts a satisfied setup step as zero however many items exist", () => {
    const gates = outstandingWork(input({ exporterCount: 9, productCount: 40 }));
    expect(gates.find((g) => g.id === "exporter")?.count).toBe(0);
    expect(gates.find((g) => g.id === "product")?.count).toBe(0);
  });

  it("marks the inspection package as available rather than outstanding", () => {
    // Generating one is something you may do for an approved record, not
    // something overdue — it must not make an otherwise clear account look busy.
    const gates = outstandingWork(input({ approvedRecords: 3 }));
    const pkg = gates.find((g) => g.id === "package");

    expect(pkg?.optional).toBe(true);
    expect(pkg?.count).toBe(3);
    expect(outstandingCount(gates)).toBe(0);
    expect(firstOutstanding(gates)).toBeNull();
  });

  it("carries the canonical copy rather than restating it", () => {
    const gates = outstandingWork(input());
    const classify = gates.find((g) => g.id === "classification");
    const canonical = FSVP_SETUP_STEPS.find((s) => s.id === "classification");

    expect(classify?.title).toBe(canonical?.title);
    expect(classify?.href).toBe(canonical?.href);
    expect(classify?.actionLabel).toBe(canonical?.actionLabel);
  });
});

describe("firstOutstanding", () => {
  it("picks the earliest gate with work, matching the old card's one good idea", () => {
    const gates = outstandingWork(input({ unclassifiedProducts: 5, unsignedRecords: 2 }));
    expect(firstOutstanding(gates)?.id).toBe("classification");
  });

  it("falls through to a later gate once the earlier ones are clear", () => {
    const gates = outstandingWork(input({ unsignedRecords: 2 }));
    expect(firstOutstanding(gates)?.id).toBe("qi");
  });

  it("returns nothing when the programme is complete", () => {
    expect(firstOutstanding(outstandingWork(input()))).toBeNull();
  });
});

describe("outstandingCount", () => {
  it("counts gates with work, not items", () => {
    const gates = outstandingWork(input({ unclassifiedProducts: 40, unsignedRecords: 2 }));
    expect(outstandingCount(gates)).toBe(2);
  });

  it("is zero for a clear programme", () => {
    expect(outstandingCount(outstandingWork(input()))).toBe(0);
  });
});

describe("detailHref", () => {
  it("points every gate at its own anchor on the pipeline page", () => {
    // The row says "5 products"; the obvious next question is which five, and
    // /setup/fsvp has already named them with a fix button each.
    for (const gate of outstandingWork(input())) {
      expect(gate.detailHref).toBe(`/setup/fsvp#gate-${gate.id}`);
    }
  });

  it("keeps the doing-screen separate from the detail view", () => {
    // href is where the work happens, detailHref is where the blockers are
    // listed. Collapsing them would lose one or the other.
    const classify = outstandingWork(input()).find((g) => g.id === "classification");
    expect(classify?.href).toBe("/products");
    expect(classify?.detailHref).not.toBe(classify?.href);
  });

  it("matches the anchor ids the pipeline page renders", () => {
    // app/setup/fsvp/page.tsx renders id={`gate-${step.id}`} for each stage,
    // and step.id comes from the same FSVP_SETUP_STEPS list.
    const ids = FSVP_SETUP_STEPS.map((s) => `/setup/fsvp#gate-${s.id}`);
    expect(outstandingWork(input()).map((g) => g.detailHref)).toEqual(ids);
  });
});
