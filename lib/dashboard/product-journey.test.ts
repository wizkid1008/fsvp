import { describe, expect, it } from "vitest";
import type { ProductStanding } from "@/lib/setup/fsvp-workflow";
import {
  PRODUCT_PHASES,
  isBlockedStanding,
  phaseFor,
  summariseProducts,
} from "./product-journey";

function standing(over: Partial<ProductStanding> = {}): ProductStanding {
  return {
    id: "p1",
    name: "Cocoa Nibs",
    supplierName: "Andes Ingredients",
    gateId: "classification",
    recordId: null,
    recordStatus: null,
    ...over,
  };
}

describe("phaseFor", () => {
  it("maps each gate into exactly one phase", () => {
    const seen = new Set<string>();
    for (const phase of PRODUCT_PHASES) {
      for (const gate of phase.gates) {
        expect(seen.has(gate)).toBe(false);
        seen.add(gate);
      }
    }
  });

  it("advances monotonically along the gates", () => {
    const order = ["product", "record", "evidence", "approval", "package"] as const;
    const indexes = order.map((gateId) => phaseFor(standing({ gateId })).index);
    for (let i = 1; i < indexes.length; i += 1) {
      expect(indexes[i]).toBeGreaterThan(indexes[i - 1]);
    }
  });

  it("reports a finished product in the final phase", () => {
    expect(phaseFor(standing({ gateId: null })).index).toBe(PRODUCT_PHASES.length - 1);
  });

  it("treats a product with only its package outstanding as approved", () => {
    // It is importable. Generating the package is what you do when FDA asks.
    expect(phaseFor(standing({ gateId: "package" })).key).toBe("approved");
  });

  it("starts an unrecognised gate at the beginning, not at done", () => {
    // Reporting "Approved" for a gate we do not recognise would be the most
    // reassuring possible wrong answer.
    expect(phaseFor(standing({ gateId: "something_new" as never })).index).toBe(0);
  });
});

describe("isBlockedStanding", () => {
  it("recognises the statuses that mean a record has stopped", () => {
    for (const recordStatus of ["needs_corrective_action", "rejected", "expired"]) {
      expect(isBlockedStanding(standing({ recordStatus }))).toBe(true);
    }
  });

  it("does not treat a product without a record as blocked", () => {
    expect(isBlockedStanding(standing({ recordStatus: null }))).toBe(false);
  });

  it("does not treat a progressing record as blocked", () => {
    expect(isBlockedStanding(standing({ recordStatus: "importer_review_pending" }))).toBe(false);
  });
});

describe("summariseProducts", () => {
  it("counts an empty programme as zero without dividing by it", () => {
    const s = summariseProducts([]);
    expect(s.total).toBe(0);
    expect(s.approved).toBe(0);
    expect(s.byPhase.every((n) => n === 0)).toBe(true);
  });

  it("keeps blocked products out of the phase counts", () => {
    const s = summariseProducts([
      standing({ id: "a" }),
      standing({ id: "b" }),
      standing({ id: "c", recordStatus: "rejected" }),
    ]);

    expect(s.total).toBe(3);
    expect(s.blocked).toBe(1);
    expect(s.byPhase.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("counts only the final phase as approved", () => {
    const s = summariseProducts([
      standing({ id: "a", gateId: null }),
      standing({ id: "b", gateId: "approval" }),
      standing({ id: "c", gateId: "classification" }),
    ]);
    expect(s.approved).toBe(1);
  });

  it("returns one count per phase so a track can render directly", () => {
    expect(summariseProducts([]).byPhase).toHaveLength(PRODUCT_PHASES.length);
  });
});
