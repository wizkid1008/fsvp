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
});
