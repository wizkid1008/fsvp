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
      undocumented: [],
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
      approvedExporters: 1,
      facilities: 1,
      approvedFacilities: 0,
      products: 1,
      records: 1,
      approvedRecords: 1,
      packages: 1,
    });
  });

  it("counts a facility approved from its resolved scoring status", () => {
    // buildCompleteFsvpSetupPlan never sees the raw facilities_verify column —
    // loadCompleteFsvpSetupPlan overlays it with the live status resolved from
    // scoring_results against approval_thresholds first, and that table is
    // seeded (migration 002) to report the top tier as "importer_approved",
    // reusing the fsvp_records.status vocabulary on purpose. This is the value
    // a genuinely approved, already-scored facility carries in practice.
    const input = cleanInput();
    input.facilities = [{
      ...input.facilities[0],
      approval_status: "importer_approved",
    }];

    const plan = buildCompleteFsvpSetupPlan(input);

    expect(plan.summary.approvedFacilities).toBe(1);
  });

  it("does not count an unscored facility, or the stale column's 'approved', as approved", () => {
    // Unscored resolves to "not_assessed". The raw column's "approved" is
    // seed data on facilities nobody scored; counting it made the dashboard
    // say 2 approved beside a Facilities page saying 0.
    for (const status of ["not_assessed", "approved"]) {
      const input = cleanInput();
      input.facilities = [{
        ...input.facilities[0],
        approval_status: status,
      }];

      expect(buildCompleteFsvpSetupPlan(input).summary.approvedFacilities).toBe(0);
    }
  });

  it("does not count a conditionally approved facility as approved", () => {
    // Valid in both vocabularies — the raw column's own CHECK constraint and
    // approval_thresholds' resolved tiers both use it — and never the top
    // tier in either.
    const input = cleanInput();
    input.facilities = [{
      ...input.facilities[0],
      approval_status: "conditionally_approved",
    }];

    const plan = buildCompleteFsvpSetupPlan(input);

    expect(plan.summary.approvedFacilities).toBe(0);
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
      href: "/products/product-1#classify-product",
      actionLabel: "Classify product",
    });
    expect(admissibility.blockers[0]).toMatchObject({
      href: "/products/product-1#classify-product",
      actionLabel: "Classify product",
    });
    // Carries the product, so /applicability opens its determination form
    // rather than a grid of every food with this one somewhere inside it.
    expect(record.blockers[0]).toMatchObject({
      href: "/applicability?product=product-1",
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
      href: "/products/product-1#determine-admissibility",
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

describe("screening progress note", () => {
  /** Two records from the SAME supplier, both screened. */
  function twoRecordsOneSupplier() {
    const base = cleanInput();
    return {
      ...base,
      // Records only count for products in the plan, so product-2 must exist.
      products: [...base.products, { ...base.products[0], id: "product-2", product_name: "Papaya" }],
      records: [
        { ...base.records[0], id: "record-1", product_id: "product-1" },
        { ...base.records[0], id: "record-2", product_id: "product-2" },
      ],
    };
  }

  it("says how many SUPPLIERS were screened when records outnumber them", () => {
    // "2 of 2 done" is true and still reads as though two screenings happened.
    // A supplier's FDA history is one fact about that firm, so one screening
    // clears every record from it.
    const plan = buildCompleteFsvpSetupPlan(twoRecordsOneSupplier());
    const screening = plan.steps.find((step) => step.id === "screening")!;

    expect(screening.progress).toEqual({ done: 2, total: 2 });
    expect(screening.progressNote).toContain("1 of 1 supplier");
  });

  it("stays quiet when there is one record per supplier", () => {
    // The note would only restate the progress label in other words.
    const plan = buildCompleteFsvpSetupPlan(cleanInput());
    expect(plan.steps.find((step) => step.id === "screening")!.progressNote).toBeUndefined();
  });

  it("is the only stage that carries a note", () => {
    // Every other stage counts the thing it acts on, so a second sentence
    // would be noise rather than a correction.
    const plan = buildCompleteFsvpSetupPlan(twoRecordsOneSupplier());
    const noted = plan.steps.filter((step) => step.progressNote).map((step) => step.id);
    expect(noted).toEqual(["screening"]);
  });
});

describe("reasons grouped by product", () => {
  it("is empty for a product with nothing open", () => {
    const plan = buildCompleteFsvpSetupPlan(cleanInput());
    expect(plan.productReasons).toEqual({});
    expect(plan.accountReasons).toEqual([]);
  });

  it("files each blocker under its product, and account-wide ones apart", () => {
    const input = cleanInput();
    input.activeQiCount = 0;
    input.determinationsByProductId = new Map([["product-1", null]]);
    input.records[0].status = "draft";
    const plan = buildCompleteFsvpSetupPlan(input);

    expect(plan.accountReasons.map((r) => r.id)).toEqual(["qi-none"]);
    const reasons = plan.productReasons["product-1"];
    expect(reasons.map((r) => r.stepId)).toContain("record");
    expect(reasons.every((r, i) => i === 0 || r.stepNumber >= reasons[i - 1].stepNumber)).toBe(true);
    // "Cannot be approved until its setup blockers are resolved" only restates
    // the reasons listed above it.
    expect(reasons.some((r) => r.actionLabel === "Resolve record blockers")).toBe(false);
  });

  it("drops the product-name prefix the stage list needs", () => {
    const input = cleanInput();
    input.admissibilityByProductId = new Map([["product-1", [
      { code: "awaiting_reference_rule", message: "no rule on file", severity: "soft" } as any,
    ]]]);
    const plan = buildCompleteFsvpSetupPlan(input);
    expect(plan.productReasons["product-1"][0].message).toBe("No rule on file");
  });
});

describe("an approved product without a package", () => {
  it("has no reasons — the package is built when FDA asks", () => {
    const input = cleanInput();
    input.packagesByRecordId = new Set();
    const plan = buildCompleteFsvpSetupPlan(input);
    expect(plan.productReasons).toEqual({});
  });
});

describe("a record for a product no longer imported", () => {
  it("raises no blockers anywhere — not on a product, not on the account", () => {
    const input = cleanInput();
    input.records = [
      ...input.records,
      { ...input.records[0], id: "record-gone", product_id: "product-discontinued", status: "draft" },
    ];
    input.evidenceByRecordId = new Map([["record-1", 1]]);
    const plan = buildCompleteFsvpSetupPlan(input);

    expect(plan.steps.flatMap((s) => s.blockers).some((b) => b.id.includes("record-gone"))).toBe(false);
    expect(plan.accountReasons).toEqual([]);
    expect(plan.productReasons).toEqual({});
  });
});

describe("checks Entry Readiness used to make on its own", () => {
  it("files an approved record past its reassessment date under its product", () => {
    const input = cleanInput();
    input.today = "2026-10-01";
    input.records[0].reassessment_due_at = "2026-05-04";
    const plan = buildCompleteFsvpSetupPlan(input);

    const reasons = plan.productReasons["product-1"];
    expect(reasons.map((r) => r.actionLabel)).toEqual(["Reassess record"]);
    expect(plan.productStandings[0].gateId).toBe("approval");
  });

  it("leaves a reassessment that is not yet due alone", () => {
    const input = cleanInput();
    input.today = "2026-10-01";
    input.records[0].reassessment_due_at = "2027-04-09";
    const plan = buildCompleteFsvpSetupPlan(input);
    expect(plan.productReasons).toEqual({});
  });

  it("raises expiring supplier documents on that supplier's products", () => {
    const input = cleanInput();
    input.expiringDocsBySupplierId = new Map([["supplier-1", 2]]);
    const plan = buildCompleteFsvpSetupPlan(input);

    const reasons = plan.productReasons["product-1"];
    expect(reasons).toHaveLength(1);
    expect(reasons[0].message).toContain("2 accepted documents from Exporter One");
    // A warning, not a gate: the product is still through.
    expect(plan.productStandings[0].gateId).toBeNull();
  });

  it("marks a prohibited product do-not-ship", () => {
    const input = cleanInput();
    input.admissibilityByProductId = new Map([["product-1", [
      { code: "prohibited", message: "Entry prohibited." },
    ]]]);
    const plan = buildCompleteFsvpSetupPlan(input);
    expect(plan.productStandings[0].doNotShip).toBe(true);
  });
});

describe("open corrective actions", () => {
  const action = {
    id: "ca-1",
    supplier_id: "supplier-1",
    product_id: null as string | null,
    fsvp_record_id: null as string | null,
    issue_description: "Salmonella found in lot 42",
  };

  it("files an action naming a product under that product", () => {
    const input = cleanInput();
    input.openCorrectiveActions = [{ ...action, product_id: "product-1" }];
    const plan = buildCompleteFsvpSetupPlan(input);
    expect(plan.productReasons["product-1"].map((r) => r.message)).toEqual([
      "Open corrective action: Salmonella found in lot 42",
    ]);
  });

  it("finds the product through the record when only the record is named", () => {
    const input = cleanInput();
    input.openCorrectiveActions = [{ ...action, fsvp_record_id: "record-1" }];
    const plan = buildCompleteFsvpSetupPlan(input);
    expect(plan.productReasons["product-1"]).toHaveLength(1);
  });

  it("raises an exporter-wide action on every product from that exporter", () => {
    const input = cleanInput();
    input.products = [...input.products, { ...input.products[0], id: "product-2", product_name: "Papaya" }];
    input.openCorrectiveActions = [action];
    const plan = buildCompleteFsvpSetupPlan(input);
    expect(plan.productReasons["product-1"]).toHaveLength(1);
    expect(plan.productReasons["product-2"].some((r) => r.actionLabel === "Resolve corrective action")).toBe(true);
    expect(plan.accountReasons).toEqual([]);
  });
});
