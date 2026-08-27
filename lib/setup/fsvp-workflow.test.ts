import { describe, expect, it } from "vitest";
import { buildCompleteFsvpSetupPlan } from "./fsvp-workflow";

type PlannerInput = Parameters<typeof buildCompleteFsvpSetupPlan>[0];

const liveDetermination = {
  id: "det-1",
  outcome: "in_scope" as const,
  basis: "standard",
  citation: "21 CFR 1.502",
  rationale: "Standard FSVP applies.",
  expires_at: null,
  superseded_at: null,
  determined_at: "2026-01-01",
};

function cleanInput(): PlannerInput {
  return {
    suppliers: [{ id: "supplier-1", company_name: "Exporter One", country: "MX" }],
    facilities: [{ id: "facility-1", facility_name: "Facility One", supplier_id: "supplier-1" }],
    facilityAccess: [],
    products: [{
      id: "product-1",
      product_name: "Mango",
      supplier_id: "supplier-1",
      facility_id: "facility-1",
      commodity_id: "commodity-1",
      country_of_origin: "MX",
    }],
    records: [{
      id: "record-1",
      status: "importer_approved",
      supplier_id: "supplier-1",
      facility_id: "facility-1",
      product_id: "product-1",
      hazard_analysis_notes: "Hazards considered.",
      supplier_evaluation_notes: "Supplier evaluated.",
      verification_determination: "Verification activities chosen.",
    }],
    activeQiCount: 1,
    packagesByRecordId: new Set(["record-1"]),
    evidenceByRecordId: new Map([["record-1", 1]]),
    determinationsByProductId: new Map([["product-1", liveDetermination]]),
    admissibilityByProductId: new Map([["product-1", []]]),
    gateBlocksByRecordId: new Map([["record-1", []]]),
    attestationsByRecordId: new Map([["record-1", {
      satisfied: true,
      reasons: [],
      required: ["hazard_analysis", "supplier_evaluation", "verification_determination"],
      state: {
        hazard_analysis: "signed",
        supplier_evaluation: "signed",
        verification_determination: "signed",
      },
    }]]),
  };
}

describe("buildCompleteFsvpSetupPlan", () => {
  it("reports the setup path complete when every gate is satisfied", () => {
    const plan = buildCompleteFsvpSetupPlan(cleanInput());

    expect(plan.steps.every((step) => step.blockers.length === 0)).toBe(true);
    expect(plan.summary).toMatchObject({
      exporters: 1,
      facilities: 1,
      products: 1,
      records: 1,
      approvedRecords: 1,
      packages: 1,
    });
  });

  it("surfaces ordered blockers with links to the corrective screens", () => {
    const input = cleanInput();
    input.products[0] = {
      ...input.products[0],
      commodity_id: null,
      country_of_origin: null,
    };
    input.records = [];
    input.packagesByRecordId = new Set();
    input.evidenceByRecordId = new Map();
    input.determinationsByProductId = new Map([["product-1", null]]);
    input.admissibilityByProductId = new Map([[
      "product-1",
      [{
        code: "not_classified",
        message: "This product is not linked to the commodity taxonomy.",
      }],
    ]]);

    const plan = buildCompleteFsvpSetupPlan(input);
    const classification = plan.steps.find((step) => step.id === "classification")!;
    const admissibility = plan.steps.find((step) => step.id === "admissibility")!;
    const record = plan.steps.find((step) => step.id === "record")!;

    expect(classification.blockers[0]).toMatchObject({
      href: "/products/product-1",
      actionLabel: "Classify product",
    });
    expect(admissibility.blockers[0]).toMatchObject({
      href: "/products/product-1",
      actionLabel: "Classify product",
    });
    expect(record.blockers[0]).toMatchObject({
      href: "/applicability",
      actionLabel: "Determine applicability",
    });
  });

  it("reports 100% when every gate is satisfied", () => {
    expect(buildCompleteFsvpSetupPlan(cleanInput()).progressPercent).toBe(100);
  });

  it("credits partly-finished steps instead of zeroing them", () => {
    // Three products, one unclassified. The old whole-step progress scored the
    // classification step 0 — the two finished products counted for nothing.
    const input = cleanInput();
    input.products = [
      input.products[0],
      { ...input.products[0], id: "product-2", product_name: "Papaya" },
      { ...input.products[0], id: "product-3", product_name: "Guava", commodity_id: null },
    ];
    for (const id of ["product-2", "product-3"]) {
      input.determinationsByProductId.set(id, liveDetermination);
      input.admissibilityByProductId.set(id, []);
    }

    const plan = buildCompleteFsvpSetupPlan(input);
    const classification = plan.steps.find((step) => step.id === "classification")!;

    expect(classification.blockers).toHaveLength(1);
    expect(classification.progress).toEqual({ done: 2, total: 3 });
    expect(plan.progressPercent).toBeGreaterThan(0);
    expect(plan.progressPercent).toBeLessThan(100);
  });

  // The soft block belongs in the gates, not on the page that lists what is
  // left to do. Pinned because reaching for hardAdmissibilityBlocks() here is
  // the natural thing to write — every other consumer of these blocks does,
  // correctly — and doing it made the step named "Determine admissibility"
  // report Complete for a product nobody had determined.
  it("counts an undetermined product as outstanding, not complete", () => {
    const input = cleanInput();
    input.admissibilityByProductId = new Map([[
      "product-1",
      [{
        code: "determination_missing",
        message: "No admissibility determination has been made for this product.",
      }],
    ]]);

    const plan = buildCompleteFsvpSetupPlan(input);
    const admissibility = plan.steps.find((step) => step.id === "admissibility")!;

    expect(admissibility.blockers).toHaveLength(1);
    expect(admissibility.blockers[0]).toMatchObject({
      href: "/products/product-1",
      actionLabel: "Determine admissibility",
    });
    expect(admissibility.progress).toEqual({ done: 0, total: 1 });
  });

  it("agrees with the product page rather than contradicting it", () => {
    // Same product, same state, four screens. /products/[id] shows
    // "Admissibility pending", /entry-readiness raises a blocker and the
    // dashboard counts a reference gap — so this one must not say Complete.
    const input = cleanInput();
    input.admissibilityByProductId = new Map([[
      "product-1",
      [{ code: "determination_missing", message: "No determination." }],
    ]]);

    const plan = buildCompleteFsvpSetupPlan(input);

    expect(plan.progressPercent).toBeLessThan(100);
  });

  it("does not tell an importer to determine what only the platform can unblock", () => {
    // Listing the work is right; naming an action with no button behind it is
    // not. When no rule is on file the product page withholds the form, so the
    // step points at the explanation instead of at a dead control.
    const input = cleanInput();
    input.admissibilityByProductId = new Map([[
      "product-1",
      [{
        code: "awaiting_reference_rule",
        message: "No country-commodity rule is on file for this commodity.",
      }],
    ]]);

    const plan = buildCompleteFsvpSetupPlan(input);
    const admissibility = plan.steps.find((step) => step.id === "admissibility")!;

    expect(admissibility.blockers).toHaveLength(1);
    expect(admissibility.blockers[0].actionLabel).toBe("See what is waiting");
    // Still outstanding — it is simply outstanding on somebody else.
    expect(admissibility.progress).toEqual({ done: 0, total: 1 });
  });

  it("still counts a determined product as done", () => {
    const plan = buildCompleteFsvpSetupPlan(cleanInput());
    const admissibility = plan.steps.find((step) => step.id === "admissibility")!;

    expect(admissibility.blockers).toHaveLength(0);
    expect(admissibility.progress).toEqual({ done: 1, total: 1 });
  });

  it("treats a step with nothing to iterate over as unstarted, not complete", () => {
    const input = cleanInput();
    input.suppliers = [];
    input.facilities = [];
    input.products = [];
    input.records = [];
    input.activeQiCount = 0;
    input.packagesByRecordId = new Set();
    input.evidenceByRecordId = new Map();
    input.determinationsByProductId = new Map();
    input.admissibilityByProductId = new Map();
    input.gateBlocksByRecordId = new Map();
    input.attestationsByRecordId = new Map();

    const plan = buildCompleteFsvpSetupPlan(input);

    expect(plan.progressPercent).toBe(0);
    expect(plan.steps.every((step) => step.progress.total > 0)).toBe(true);
  });
});
