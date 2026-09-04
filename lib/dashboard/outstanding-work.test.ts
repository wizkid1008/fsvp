import { describe, expect, it } from "vitest";
import { FSVP_SETUP_STEPS } from "@/lib/setup/fsvp-steps";
import type { SetupStep } from "@/lib/setup/fsvp-workflow";
import {
  firstOutstanding,
  outstandingCount,
  outstandingWork,
} from "./outstanding-work";

/**
 * Stages shaped like the planner's, since that is the only input now.
 *
 * `over` keys by step id: `{ classification: { done: 2, total: 5 } }`.
 */
function steps(
  over: Record<string, {
    done?: number;
    total?: number;
    blockers?: number;
    /** One href per blocker, when the test cares where they point. */
    blockerHrefs?: string[];
    /** Blocker action label, when it should differ from the stage's. */
    blockerLabel?: string;
  }> = {}
): SetupStep[] {
  return FSVP_SETUP_STEPS.map((step) => {
    const o = over[step.id] ?? {};
    const total = o.total ?? 1;
    const done = o.done ?? total;
    const hrefs = o.blockerHrefs
      ?? Array.from({ length: o.blockers ?? Math.max(0, total - done) }, () => step.href);
    return {
      id: step.id,
      title: step.title,
      description: step.description,
      href: step.href,
      actionLabel: step.actionLabel,
      blockers: hrefs.map((href, i) => ({
        id: `${step.id}-${i}`,
        message: `${step.id} blocker ${i}`,
        href,
        actionLabel: o.blockerLabel ?? step.actionLabel,
      })),
      progress: { done, total },
    };
  }) as SetupStep[];
}

describe("outstandingWork", () => {
  it("covers every canonical gate, in order", () => {
    // The card this replaces could only ever reach six of the eleven, so the
    // "of 11" it printed described a list it could not walk.
    expect(outstandingWork(steps()).map((g) => g.id)).toEqual(FSVP_SETUP_STEPS.map((s) => s.id));
  });

  it("reaches the gates the old next-step chain could not", () => {
    const gates = outstandingWork(steps({
      screening: { done: 0, total: 3 },
      qi:        { done: 1, total: 3 },
      approval:  { done: 0, total: 1 },
    }));
    const byId = Object.fromEntries(gates.map((g) => [g.id, g.count]));

    expect(byId.screening).toBe(3);
    expect(byId.qi).toBe(2);
    expect(byId.approval).toBe(1);
  });

  it("counts items rather than reporting one position for the account", () => {
    const gates = outstandingWork(steps({
      classification: { done: 2, total: 5 },
      qi:             { done: 0, total: 2 },
    }));
    const byId = Object.fromEntries(gates.map((g) => [g.id, g.count]));

    // Both are true at once. The old card could only say one of them.
    expect(byId.classification).toBe(3);
    expect(byId.qi).toBe(2);
  });

  it("counts outstanding items, not blockers", () => {
    // One product can carry two blockers. Reporting "2 products" when there is
    // one product with two problems would overstate how much is left.
    const gates = outstandingWork(steps({ product: { done: 4, total: 5, blockers: 2 } }));
    const product = gates.find((g) => g.id === "product");

    expect(product?.count).toBe(1);
    expect(product?.blockers).toBe(2);
  });

  it("never reports a negative count", () => {
    const gates = outstandingWork(steps({ classification: { done: 9, total: 5 } }));
    expect(gates.find((g) => g.id === "classification")?.count).toBe(0);
  });

  it("takes the planner's definition rather than a second opinion", () => {
    // The dashboard used to answer "Create product — Done" from its own
    // shallow check while the pipeline said one product was missing its
    // facility link. There is one source now, so a partly-done stage is
    // outstanding on both surfaces.
    const gates = outstandingWork(steps({ product: { done: 4, total: 5 } }));
    expect(gates.find((g) => g.id === "product")?.count).toBe(1);
  });

  it("flags the three onboarding gates as setup", () => {
    const gates = outstandingWork(steps());
    for (const id of ["exporter", "facility", "product"]) {
      expect(gates.find((g) => g.id === id)?.setup).toBe(true);
    }
    expect(gates.find((g) => g.id === "qi")?.setup).toBe(false);
  });

  it("marks the inspection package as available rather than outstanding", () => {
    // Generating one is something you may do for an approved record, not
    // something overdue — it must not make an otherwise clear account look busy.
    const gates = outstandingWork(steps({ package: { done: 0, total: 3 } }));
    const pkg = gates.find((g) => g.id === "package");

    expect(pkg?.optional).toBe(true);
    expect(pkg?.count).toBe(3);
    expect(outstandingCount(gates)).toBe(0);
    expect(firstOutstanding(gates)).toBeNull();
  });

  it("names each stage's unit from what the planner actually counts", () => {
    const gates = outstandingWork(steps());
    const unit = (id: string) => gates.find((g) => g.id === id)?.unit;

    // The facility stage counts EXPORTERS that have a facility, not facilities.
    expect(unit("facility")).toBe("exporter");
    expect(unit("classification")).toBe("product");
    expect(unit("approval")).toBe("record");
  });

  it("refuses to name a unit the QI stage cannot honestly claim", () => {
    // Its total is 1 + records: one slot for whether the register holds an
    // active qualified individual at all, then one per record. Calling the
    // outstanding count a number of records is wrong exactly when the register
    // is the thing missing.
    expect(outstandingWork(steps()).find((g) => g.id === "qi")?.unit).toBeNull();
  });

  it("carries the canonical copy rather than restating it", () => {
    const gates = outstandingWork(steps());
    const classify = gates.find((g) => g.id === "classification");
    const canonical = FSVP_SETUP_STEPS.find((s) => s.id === "classification");

    expect(classify?.title).toBe(canonical?.title);
    expect(classify?.href).toBe(canonical?.href);
    expect(classify?.actionLabel).toBe(canonical?.actionLabel);
  });
});

describe("firstOutstanding", () => {
  it("picks the earliest gate with work", () => {
    const gates = outstandingWork(steps({
      classification: { done: 0, total: 5 },
      qi:             { done: 0, total: 2 },
    }));
    expect(firstOutstanding(gates)?.id).toBe("classification");
  });

  it("falls through to a later gate once the earlier ones are clear", () => {
    expect(firstOutstanding(outstandingWork(steps({ qi: { done: 0, total: 2 } })))?.id).toBe("qi");
  });

  it("returns nothing when every gate is clear", () => {
    expect(firstOutstanding(outstandingWork(steps()))).toBeNull();
  });
});

describe("outstandingCount", () => {
  it("counts gates with work, not items", () => {
    const gates = outstandingWork(steps({
      classification: { done: 0, total: 40 },
      qi:             { done: 0, total: 2 },
    }));
    expect(outstandingCount(gates)).toBe(2);
  });

  it("is zero for a clear programme", () => {
    expect(outstandingCount(outstandingWork(steps()))).toBe(0);
  });
});

describe("detailHref", () => {
  it("points a clear gate at its own anchor on the pipeline page", () => {
    for (const gate of outstandingWork(steps())) {
      expect(gate.detailHref).toBe(`/setup/fsvp#gate-${gate.id}`);
    }
  });

  it("keeps the doing-screen separate when there is nothing to collapse to", () => {
    // With no blockers there is no single destination to prefer, so href is
    // where the work happens and detailHref is the stage listing.
    const classify = outstandingWork(steps()).find((g) => g.id === "classification");
    expect(classify?.href).toBe("/products");
    expect(classify?.detailHref).not.toBe(classify?.href);
  });

  it("goes straight to the item when every blocker names the same screen", () => {
    // The row already says "1 product", so the system knows which product.
    // Routing through the stage listing to click again makes the reader
    // re-derive an answer it already had.
    const gates = outstandingWork(steps({
      classification: { done: 4, total: 5, blockerHrefs: ["/products/fonio"] },
    }));
    const classify = gates.find((g) => g.id === "classification");

    expect(classify?.detailHref).toBe("/products/fonio");
    expect(classify?.href).toBe("/products/fonio");
  });

  it("collapses on destination, not on blocker count", () => {
    // One product with two problems is still one destination. Counting
    // blockers instead would send the reader to the listing for no reason.
    const gates = outstandingWork(steps({
      admissibility: { done: 4, total: 5, blockerHrefs: ["/products/fonio", "/products/fonio"] },
    }));
    const admissibility = gates.find((g) => g.id === "admissibility");

    expect(admissibility?.blockers).toBe(2);
    expect(admissibility?.detailHref).toBe("/products/fonio");
  });

  it("falls back to the pipeline when the blockers disagree", () => {
    // Five products, five destinations. Now the listing is the only place that
    // can say which is which, so the detour earns itself.
    const gates = outstandingWork(steps({
      classification: {
        done: 0,
        total: 5,
        blockerHrefs: ["/products/a", "/products/b", "/products/c"],
      },
    }));
    const classify = gates.find((g) => g.id === "classification");

    expect(classify?.detailHref).toBe("/setup/fsvp#gate-classification");
    expect(classify?.href).toBe("/products");
  });

  it("prefers the blocker's own label when it collapses", () => {
    // "Classify product" is more specific than the stage's "Review
    // classifications", and once the row goes to one product it should say the
    // thing that will be done to it.
    const gates = outstandingWork(steps({
      classification: {
        done: 4, total: 5,
        blockerHrefs: ["/products/fonio"],
        blockerLabel: "Classify product",
      },
    }));
    expect(gates.find((g) => g.id === "classification")?.actionLabel).toBe("Classify product");
  });

  it("keeps the stage label when the row does not collapse", () => {
    // The row is going to the listing, so it should say what the stage is,
    // not what would be done to one of the several items behind it.
    const gates = outstandingWork(steps({
      admissibility: { done: 3, total: 5, blockerHrefs: ["/products/a", "/products/b"] },
    }));
    const stage = FSVP_SETUP_STEPS.find((s) => s.id === "admissibility");
    expect(gates.find((g) => g.id === "admissibility")?.actionLabel).toBe(stage?.actionLabel);
  });

  it("matches the anchor ids the pipeline page renders", () => {
    // app/setup/fsvp/page.tsx renders id={`gate-${step.id}`} for each stage,
    // and step.id comes from the same FSVP_SETUP_STEPS list.
    const ids = FSVP_SETUP_STEPS.map((s) => `/setup/fsvp#gate-${s.id}`);
    expect(outstandingWork(steps()).map((g) => g.detailHref)).toEqual(ids);
  });
});
