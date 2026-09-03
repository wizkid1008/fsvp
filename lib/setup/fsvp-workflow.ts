import { evaluateAdmissibility, type AdmissibilityBlock } from "@/lib/admissibility/gate";
import { fetchDetermination, isDeterminationLive, type LiveDetermination } from "@/lib/fsvp/applicability";
import { evaluateGates, type GateBlock } from "@/lib/fsvp/gates";
import { evaluateAttestations, type AttestationEvaluation, type AttestationInput } from "@/lib/fsvp/qi-attestation";
import { isActiveOn } from "@/lib/fsvp/qualified-individuals";
import { fetchApprovalStatusMap } from "@/lib/scoring";
import { FSVP_SETUP_STEP_COPY as STEP_COPY } from "./fsvp-steps";
import type { FsvpSetupStepId } from "./fsvp-steps";

export { FSVP_SETUP_STEPS, type FsvpSetupStepId } from "./fsvp-steps";

type SupabaseLike = { from: (table: string) => any };

export type SetupBlocker = {
  id: string;
  message: string;
  href: string;
  actionLabel: string;
};

/**
 * How much of a step is done, in the units that step actually works in —
 * exporters with a facility, products classified, records signed.
 *
 * Progress used to be "steps with zero blockers / total steps", which meant one
 * unclassified product among twenty zeroed out the whole classification step.
 * An importer could clear nineteen products and watch the bar not move, so the
 * bar taught them their work did not count.
 */
export type SetupProgress = {
  done: number;
  total: number;
};

export type SetupStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  blockers: SetupBlocker[];
  progress: SetupProgress;
};

export type SetupSummary = {
  exporters: number;
  approvedExporters: number;
  facilities: number;
  approvedFacilities: number;
  products: number;
  records: number;
  approvedRecords: number;
  packages: number;
};

/**
 * Where one product stands: the first gate it has not cleared.
 *
 * The product is the unit an importer thinks in. A record is an artefact of a
 * product rather than a peer of it — a product may have no record yet, or
 * several where it is sourced from more than one facility — so "how far along
 * are we" is asked and answered per product.
 */
export type ProductStanding = {
  id: string;
  name: string;
  supplierName: string | null;
  /** First gate not cleared. Null once the product is fully through. */
  gateId: FsvpSetupStepId | null;
  recordId: string | null;
  recordStatus: string | null;
};

export type CompleteFsvpSetupPlan = {
  steps: SetupStep[];
  /** One entry per active product, in the order the products were loaded. */
  productStandings: ProductStanding[];
  summary: SetupSummary;
  /** Whole-plan completion, 0–100, weighted by each step's own unit count. */
  progressPercent: number;
};

type SupplierRow = { id: string; company_name: string; country: string | null };
type FacilityRow = { id: string; facility_name: string; supplier_id: string | null; approval_status?: string | null };
type FacilityAccessRow = { facility_id: string; supplier_id: string };
type ProductRow = {
  id: string;
  product_name: string;
  supplier_id: string | null;
  facility_id: string | null;
  commodity_id: string | null;
  country_of_origin: string | null;
};
type RecordRow = {
  id: string;
  status: string;
  supplier_id: string;
  facility_id: string;
  product_id: string;
  hazard_analysis_notes: string | null;
  supplier_evaluation_notes: string | null;
  verification_determination: string | null;
};

type PlannerInput = {
  suppliers: SupplierRow[];
  facilities: FacilityRow[];
  facilityAccess: FacilityAccessRow[];
  products: ProductRow[];
  records: RecordRow[];
  activeQiCount: number;
  packagesByRecordId: Set<string>;
  evidenceByRecordId: Map<string, number>;
  determinationsByProductId: Map<string, LiveDetermination | null>;
  admissibilityByProductId: Map<string, AdmissibilityBlock[]>;
  gateBlocksByRecordId: Map<string, GateBlock[]>;
  attestationsByRecordId: Map<string, AttestationEvaluation>;
};

function blocker(id: string, message: string, href: string, actionLabel: string): SetupBlocker {
  return { id, message, href, actionLabel };
}

function hasFacilityForSupplier(
  supplierId: string,
  facilities: FacilityRow[],
  facilityAccess: FacilityAccessRow[]
): boolean {
  return (
    facilities.some((f) => f.supplier_id === supplierId) ||
    facilityAccess.some((a) => a.supplier_id === supplierId)
  );
}

function productLabel(product: ProductRow): string {
  return product.product_name || "Unnamed product";
}

function recordLabel(
  record: RecordRow,
  products: Map<string, ProductRow>,
  suppliers: Map<string, SupplierRow>
): string {
  const product = products.get(record.product_id)?.product_name ?? "FSVP record";
  const supplier = suppliers.get(record.supplier_id)?.company_name;
  return supplier ? `${product} from ${supplier}` : product;
}

export function buildCompleteFsvpSetupPlan(input: PlannerInput): CompleteFsvpSetupPlan {
  const suppliersById = new Map(input.suppliers.map((s) => [s.id, s]));
  const productsById = new Map(input.products.map((p) => [p.id, p]));
  const recordsByProductId = new Map<string, RecordRow[]>();
  for (const record of input.records) {
    const existing = recordsByProductId.get(record.product_id) ?? [];
    existing.push(record);
    recordsByProductId.set(record.product_id, existing);
  }

  const steps: SetupStep[] = [];

  /**
   * A step that has nothing to iterate over yet is 0 of 1, not 0 of 0 — an
   * importer with no products has not finished classification, and 0/0 would
   * otherwise read as complete.
   */
  const progress = (done: number, total: number): SetupProgress =>
    total === 0 ? { done: 0, total: 1 } : { done, total };

  const countWhere = <T,>(items: T[], predicate: (item: T) => boolean): number =>
    items.filter(predicate).length;
  const approvedRecordStatuses = new Set(["importer_approved", "conditionally_approved"]);

  steps.push({
    ...STEP_COPY.exporter,
    blockers: input.suppliers.length === 0
      ? [blocker(
          "exporter-none",
          "No exporter is linked or managed yet. Create an exporter record, or link one who already has an account.",
          "/exporters",
          "Create or link exporter"
        )]
      : [],
    progress: progress(input.suppliers.length > 0 ? 1 : 0, 1),
  });

  const facilityBlockers: SetupBlocker[] = [];
  if (input.suppliers.length === 0) {
    facilityBlockers.push(blocker(
      "facility-needs-exporter",
      "Create or link an exporter before adding a facility.",
      "/exporters",
      "Create exporter first"
    ));
  } else {
    for (const supplier of input.suppliers) {
      if (!hasFacilityForSupplier(supplier.id, input.facilities, input.facilityAccess)) {
        facilityBlockers.push(blocker(
          `facility-${supplier.id}`,
          `${supplier.company_name} has no linked facility.`,
          "/facilities",
          "Add facility"
        ));
      }
    }
  }
  steps.push({
    ...STEP_COPY.facility,
    blockers: facilityBlockers,
    progress: progress(
      countWhere(input.suppliers, (s) => hasFacilityForSupplier(s.id, input.facilities, input.facilityAccess)),
      input.suppliers.length
    ),
  });

  const productBlockers: SetupBlocker[] = [];
  if (input.facilities.length === 0) {
    productBlockers.push(blocker(
      "product-needs-facility",
      "Add at least one facility before creating a product.",
      "/facilities",
      "Add facility first"
    ));
  } else if (input.products.length === 0) {
    productBlockers.push(blocker(
      "product-none",
      "No product has been created for the exporter/facility combination.",
      "/products",
      "Add product"
    ));
  } else {
    for (const product of input.products) {
      if (!product.supplier_id || !product.facility_id) {
        const missingLink = !product.supplier_id && !product.facility_id
          ? "exporter and facility links"
          : !product.supplier_id
            ? "exporter link"
            : "facility link";
        productBlockers.push(blocker(
          `product-link-${product.id}`,
          `${productLabel(product)} is missing its ${missingLink}.`,
          `/products/${product.id}`,
          "Fix product"
        ));
      }
    }
  }
  steps.push({
    ...STEP_COPY.product,
    blockers: productBlockers,
    progress: progress(
      countWhere(input.products, (p) => Boolean(p.supplier_id && p.facility_id)),
      input.products.length
    ),
  });

  const classificationBlockers = input.products.flatMap((product) => {
    const missing = [
      !product.commodity_id ? "commodity taxonomy classification" : null,
      !product.country_of_origin ? "country of origin" : null,
    ].filter(Boolean);
    return missing.length > 0
      ? [blocker(
          `classification-${product.id}`,
          `${productLabel(product)} is missing ${missing.join(" and ")}.`,
          `/products/${product.id}`,
          "Classify product"
        )]
      : [];
  });
  if (input.products.length === 0) {
    classificationBlockers.push(blocker(
      "classification-needs-product",
      "Create a product before classifying it against the commodity taxonomy.",
      "/products",
      "Add product first"
    ));
  }
  steps.push({
    ...STEP_COPY.classification,
    blockers: classificationBlockers,
    progress: progress(
      countWhere(input.products, (p) => Boolean(p.commodity_id && p.country_of_origin)),
      input.products.length
    ),
  });

  // EVERY block counts here, including the soft one — and that is the whole
  // difference between this screen and the gates.
  //
  // `determination_missing` is soft on purpose: an undetermined food may still
  // be drafted against, and hard-blocking it would wall off every product while
  // the reference layer is empty. But soft means "does not stop approval", not
  // "is not outstanding work", and this page exists to list outstanding work.
  // Filtering it out left the step named "Determine admissibility" able to
  // report only failures belonging to OTHER steps, so a product whose
  // admissibility had never been determined read as Complete — while the
  // product page called it pending, entry readiness called it a blocker, and
  // the dashboard counted it as a gap. Four screens, and the one an importer
  // opens to find out what to do next was the one that was wrong.
  const admissibilityBlockers: SetupBlocker[] = [];
  for (const product of input.products) {
    const blocks = input.admissibilityByProductId.get(product.id) ?? [];
    for (const [index, item] of blocks.entries()) {
      // The action has to name something the reader can actually do. When the
      // reference layer has no rule for the commodity, "Determine
      // admissibility" is an instruction to press a button that is no longer
      // there — the work belongs to an administrator, and all the importer can
      // usefully do is read why.
      const actionLabel =
        item.code === "not_classified"
          ? "Classify product"
          : item.code === "awaiting_reference_rule"
            ? "See what is waiting"
            : "Determine admissibility";
      admissibilityBlockers.push(blocker(
        `admissibility-${product.id}-${item.code}-${index}`,
        `${productLabel(product)}: ${item.message}`,
        `/products/${product.id}`,
        actionLabel
      ));
    }
  }
  if (input.products.length === 0) {
    admissibilityBlockers.push(blocker(
      "admissibility-needs-product",
      "Create and classify a product before making an admissibility determination.",
      "/products",
      "Add product first"
    ));
  }
  steps.push({
    ...STEP_COPY.admissibility,
    blockers: admissibilityBlockers,
    progress: progress(
      // Counted the same way, for the same reason: a product nobody has
      // determined is not a product this step is done with.
      countWhere(input.products, (p) => (input.admissibilityByProductId.get(p.id) ?? []).length === 0),
      input.products.length
    ),
  });

  const recordBlockers: SetupBlocker[] = [];
  for (const product of input.products) {
    const determination = input.determinationsByProductId.get(product.id) ?? null;
    if (!determination) {
      recordBlockers.push(blocker(
        `applicability-${product.id}`,
        `${productLabel(product)} has no FSVP applicability determination.`,
        "/applicability",
        "Determine applicability"
      ));
      continue;
    }
    if (!isDeterminationLive(determination)) {
      recordBlockers.push(blocker(
        `applicability-expired-${product.id}`,
        `${productLabel(product)} has an expired FSVP applicability determination.`,
        "/applicability",
        "Renew determination"
      ));
      continue;
    }
    if (determination.outcome !== "exempt" && (recordsByProductId.get(product.id) ?? []).length === 0) {
      recordBlockers.push(blocker(
        `record-${product.id}`,
        `${productLabel(product)} is subject to FSVP or modified requirements, but no FSVP record has been opened.`,
        "/fsvp-records/new",
        "Open FSVP record"
      ));
    }
  }
  if (input.products.length === 0) {
    recordBlockers.push(blocker(
      "record-needs-product",
      "Create a product before determining applicability or opening an FSVP record.",
      "/products",
      "Add product first"
    ));
  }
  steps.push({
    ...STEP_COPY.record,
    blockers: recordBlockers,
    // An exempt product is finished at this step: FSVP does not apply, so no
    // record is owed and none will ever be opened.
    progress: progress(
      countWhere(input.products, (p) => {
        const determination = input.determinationsByProductId.get(p.id) ?? null;
        if (!determination || !isDeterminationLive(determination)) return false;
        return determination.outcome === "exempt" || (recordsByProductId.get(p.id) ?? []).length > 0;
      }),
      input.products.length
    ),
  });

  const screeningBlockers: SetupBlocker[] = [];
  for (const record of input.records) {
    for (const item of input.gateBlocksByRecordId.get(record.id) ?? []) {
      if (!item.code.startsWith("compliance_screening")) continue;
      screeningBlockers.push(blocker(
        `screening-${record.id}-${item.code}`,
        `${recordLabel(record, productsById, suppliersById)}: ${item.message}`,
        "/compliance-history",
        "Record screening"
      ));
    }
  }
  if (input.records.length === 0) {
    screeningBlockers.push(blocker(
      "screening-needs-record",
      "Open an FSVP record before recording the supplier compliance screening for approval.",
      "/fsvp-records/new",
      "Open FSVP record first"
    ));
  }
  steps.push({
    ...STEP_COPY.screening,
    blockers: screeningBlockers,
    progress: progress(
      countWhere(input.records, (r) =>
        (input.gateBlocksByRecordId.get(r.id) ?? []).every((b) => !b.code.startsWith("compliance_screening"))
      ),
      input.records.length
    ),
  });

  const evidenceBlockers: SetupBlocker[] = [];
  for (const record of input.records) {
    if ((input.evidenceByRecordId.get(record.id) ?? 0) === 0) {
      evidenceBlockers.push(blocker(
        `evidence-${record.id}`,
        `${recordLabel(record, productsById, suppliersById)} has no accepted evidence attached to the FSVP record.`,
        `/fsvp-records/${record.id}`,
        "Attach evidence"
      ));
    }
  }
  if (input.records.length === 0) {
    evidenceBlockers.push(blocker(
      "evidence-needs-record",
      "Open an FSVP record before assembling and reviewing its evidence package.",
      "/fsvp-records/new",
      "Open FSVP record first"
    ));
  }
  steps.push({
    ...STEP_COPY.evidence,
    blockers: evidenceBlockers,
    progress: progress(
      countWhere(input.records, (r) => (input.evidenceByRecordId.get(r.id) ?? 0) > 0),
      input.records.length
    ),
  });

  const qiBlockers: SetupBlocker[] = [];
  if (input.activeQiCount === 0) {
    qiBlockers.push(blocker(
      "qi-none",
      "No active qualified individual is on the importer register.",
      "/qualified-individuals",
      "Add qualified individual"
    ));
  }
  for (const record of input.records) {
    const attestation = input.attestationsByRecordId.get(record.id);
    for (const [index, reason] of (attestation?.reasons ?? []).entries()) {
      qiBlockers.push(blocker(
        `qi-${record.id}-${index}`,
        `${recordLabel(record, productsById, suppliersById)}: ${reason}`,
        `/fsvp-records/${record.id}`,
        "Complete QI attestation"
      ));
    }
  }
  if (input.records.length === 0) {
    qiBlockers.push(blocker(
      "qi-needs-record",
      "Open an FSVP record before qualified individuals can sign its determinations.",
      "/fsvp-records/new",
      "Open FSVP record first"
    ));
  }
  steps.push({
    ...STEP_COPY.qi,
    blockers: qiBlockers,
    // The register itself counts as one unit alongside each record's signatures
    // — an importer with no QI on the register has not started this step even if
    // it has no records to sign yet.
    progress: progress(
      (input.activeQiCount > 0 ? 1 : 0) +
        countWhere(input.records, (r) => (input.attestationsByRecordId.get(r.id)?.reasons ?? []).length === 0),
      1 + input.records.length
    ),
  });

  const approvalBlockers: SetupBlocker[] = [];
  for (const record of input.records) {
    const gateBlocks = input.gateBlocksByRecordId.get(record.id) ?? [];
    const attestation = input.attestationsByRecordId.get(record.id);
    const product = productsById.get(record.product_id);
    const determination = product ? input.determinationsByProductId.get(product.id) ?? null : null;
    const earlierBlocks =
      gateBlocks.length +
      (attestation?.reasons.length ?? 0) +
      ((input.evidenceByRecordId.get(record.id) ?? 0) === 0 ? 1 : 0) +
      (!determination || !isDeterminationLive(determination) ? 1 : 0);

    if (approvedRecordStatuses.has(record.status)) continue;
    approvalBlockers.push(blocker(
      `approval-${record.id}`,
      earlierBlocks > 0
        ? `${recordLabel(record, productsById, suppliersById)} cannot be approved until its setup blockers are resolved.`
        : `${recordLabel(record, productsById, suppliersById)} is ready for an importer approval decision.`,
      `/fsvp-records/${record.id}`,
      earlierBlocks > 0 ? "Resolve record blockers" : "Record approval decision"
    ));
  }
  if (input.records.length === 0) {
    approvalBlockers.push(blocker(
      "approval-needs-record",
      "Open an FSVP record before making an approval decision.",
      "/fsvp-records/new",
      "Open FSVP record first"
    ));
  }
  steps.push({
    ...STEP_COPY.approval,
    blockers: approvalBlockers,
    progress: progress(
      countWhere(input.records, (r) => approvedRecordStatuses.has(r.status)),
      input.records.length
    ),
  });

  const packageBlockers: SetupBlocker[] = [];
  const approvedRecords = input.records.filter((r) => approvedRecordStatuses.has(r.status));
  for (const record of approvedRecords) {
    if (!input.packagesByRecordId.has(record.id)) {
      packageBlockers.push(blocker(
        `package-${record.id}`,
        `${recordLabel(record, productsById, suppliersById)} is approved but no inspection package has been generated yet.`,
        `/fsvp-records/${record.id}`,
        "Generate package"
      ));
    }
  }
  if (approvedRecords.length === 0) {
    packageBlockers.push(blocker(
      "package-needs-approval",
      "Approve an FSVP record before generating the inspection package.",
      "/fsvp-records",
      "Approve record first"
    ));
  }
  steps.push({
    ...STEP_COPY.package,
    blockers: packageBlockers,
    progress: progress(
      countWhere(approvedRecords, (r) => input.packagesByRecordId.has(r.id)),
      approvedRecords.length
    ),
  });

  const unitsDone = steps.reduce((sum, step) => sum + step.progress.done, 0);
  const unitsTotal = steps.reduce((sum, step) => sum + step.progress.total, 0);

  /**
   * Where each product stands, as the first gate it has not cleared.
   *
   * The gates above answer "how much work of this kind is left". This answers
   * the other half — "where is Cocoa Nibs" — and it is per PRODUCT because the
   * product is the unit an importer thinks in. A record is an artefact of a
   * product, not a peer of it: a product may have none yet, or more than one
   * where it is sourced from several facilities.
   *
   * The order mirrors the gates, and each test is the same one the
   * corresponding gate applies, so a product's standing cannot contradict the
   * stage it is counted under.
   */
  const productStandings: ProductStanding[] = input.products.map((product) => {
    const records = recordsByProductId.get(product.id) ?? [];
    // Where a product is sourced from several facilities it has several
    // records. The furthest along is the one that describes the product's
    // standing; the others surface as their own blockers on the gates above.
    const record =
      records.find((r) => r.status === "importer_approved") ??
      records.find((r) => r.status === "conditionally_approved") ??
      records[0] ??
      null;

    const determination = input.determinationsByProductId.get(product.id) ?? null;
    const live = Boolean(determination && isDeterminationLive(determination));
    // Computed rather than narrowed inside the chain below, where TypeScript
    // cannot see that `live` implies `determination` is non-null.
    const exempt = live && determination?.outcome === "exempt";

    const gateId: FsvpSetupStepId | null =
      !product.supplier_id || !product.facility_id ? "product"
      : !product.commodity_id || !product.country_of_origin ? "classification"
      : (input.admissibilityByProductId.get(product.id) ?? []).length > 0 ? "admissibility"
      // An exempt food needs no record, so a live exemption clears this gate
      // rather than parking the product at it forever.
      : !live || (!exempt && !record) ? "record"
      : !record ? null
      : (input.gateBlocksByRecordId.get(record.id) ?? []).some((b) => b.code.startsWith("compliance_screening")) ? "screening"
      : (input.evidenceByRecordId.get(record.id) ?? 0) === 0 ? "evidence"
      : (input.attestationsByRecordId.get(record.id)?.reasons ?? []).length > 0 ? "qi"
      : !approvedRecordStatuses.has(record.status) ? "approval"
      : !input.packagesByRecordId.has(record.id) ? "package"
      : null;

    return {
      id: product.id,
      name: productLabel(product),
      supplierName: product.supplier_id
        ? suppliersById.get(product.supplier_id)?.company_name ?? null
        : null,
      gateId,
      recordId: record?.id ?? null,
      recordStatus: record?.status ?? null,
    };
  });

  const recordsBySupplierId = new Map<string, RecordRow[]>();
  for (const record of input.records) {
    const existing = recordsBySupplierId.get(record.supplier_id) ?? [];
    existing.push(record);
    recordsBySupplierId.set(record.supplier_id, existing);
  }
  const approvedExporters = input.suppliers.filter((supplier) => {
    const records = recordsBySupplierId.get(supplier.id) ?? [];
    return records.length > 0 && records.every((record) => approvedRecordStatuses.has(record.status));
  }).length;
  const approvedFacilities = input.facilities.filter((facility) =>
    ["importer_approved", "approved"].includes(facility.approval_status ?? "")
  ).length;

  return {
    steps,
    productStandings,
    progressPercent: unitsTotal === 0 ? 0 : Math.round((unitsDone / unitsTotal) * 100),
    summary: {
      exporters: input.suppliers.length,
      approvedExporters,
      facilities: input.facilities.length,
      approvedFacilities,
      products: input.products.length,
      records: input.records.length,
      approvedRecords: approvedRecords.length,
      packages: input.packagesByRecordId.size,
    },
  };
}

export async function loadCompleteFsvpSetupPlan(
  supabase: SupabaseLike,
  importerId: string
): Promise<CompleteFsvpSetupPlan> {
  const { data: relationshipRows } = await (supabase.from("supplier_relationships") as any)
    .select("supplier_id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", importerId)
    .in("status", ["active", "pending_invite"]);

  const supplierIds = [
    ...new Set(
      ((relationshipRows ?? []) as Array<{ supplier_id: string | null }>)
        .map((row) => row.supplier_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const [
    { data: supplierRows },
    { data: facilityRows },
    { data: facilityAccessRows },
    { data: productRows },
    { data: recordRows },
    { data: packageRows },
    { data: evidenceRows },
    { data: qiRows },
  ] = await Promise.all([
    supplierIds.length
      ? (supabase.from("suppliers") as any)
          .select("id, company_name, country")
          .in("id", supplierIds)
          .order("company_name")
      : Promise.resolve({ data: [] }),
    supplierIds.length
      ? (supabase.from("facilities_verify") as any)
          .select("id, facility_name, supplier_id, approval_status")
          .in("supplier_id", supplierIds)
      : Promise.resolve({ data: [] }),
    supplierIds.length
      ? (supabase.from("facility_supplier_access") as any)
          .select("facility_id, supplier_id")
          .in("supplier_id", supplierIds)
      : Promise.resolve({ data: [] }),
    supplierIds.length
      ? (supabase.from("products_verify") as any)
          .select("id, product_name, supplier_id, facility_id, commodity_id, country_of_origin")
          .in("supplier_id", supplierIds)
          // Only food actually imported carries an FSVP obligation — see
          // migration 022. A product never sourced, or no longer sourced, must
          // stop appearing as work without being deleted, because § 1.510 keeps
          // the records of anything that WAS imported for two years after.
          .eq("lifecycle", "active")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    (supabase.from("fsvp_records") as any)
      .select(
        "id, status, supplier_id, facility_id, product_id, " +
        "hazard_analysis_notes, supplier_evaluation_notes, verification_determination"
      )
      .eq("importer_id", importerId)
      .order("created_at", { ascending: false }),
    (supabase.from("generated_reports") as any)
      .select("fsvp_record_id")
      .eq("importer_id", importerId)
      .eq("report_type", "fsvp_record_package"),
    // Scoped through the record to this importer. This ran unfiltered, and
    // loadCompleteFsvpSetupPlan is called with the ADMIN client, which bypasses
    // RLS — so it pulled every tenant's evidence rows into the map. Nothing
    // cross-tenant was displayed, because every lookup is by one of this
    // importer's own record ids, but the map held other tenants' data and the
    // first code to iterate it rather than index it would have leaked.
    (supabase.from("fsvp_record_evidence") as any)
      .select("fsvp_record_id, documents!inner(evidence_status), fsvp_records!inner(importer_id)")
      .eq("fsvp_records.importer_id", importerId),
    (supabase.from("qualified_individuals") as any)
      .select("id, active_from, active_to")
      .eq("importer_id", importerId),
  ]);

  const suppliers = (supplierRows ?? []) as SupplierRow[];
  const facilities = (facilityRows ?? []) as FacilityRow[];
  const facilityAccess = (facilityAccessRows ?? []) as FacilityAccessRow[];
  const products = (productRows ?? []) as ProductRow[];
  const records = (recordRows ?? []) as RecordRow[];

  const evidenceByRecordId = new Map<string, number>();
  for (const row of (evidenceRows ?? []) as Array<{
    fsvp_record_id: string | null;
    documents: { evidence_status: string | null } | null;
  }>) {
    if (!row.fsvp_record_id) continue;
    if (row.documents?.evidence_status !== "accepted") continue;
    evidenceByRecordId.set(row.fsvp_record_id, (evidenceByRecordId.get(row.fsvp_record_id) ?? 0) + 1);
  }

  const packagesByRecordId = new Set(
    ((packageRows ?? []) as Array<{ fsvp_record_id: string | null }>)
      .map((row) => row.fsvp_record_id)
      .filter((id): id is string => Boolean(id))
  );

  const activeQiCount = ((qiRows ?? []) as Array<{ active_from: string; active_to: string | null }>)
    .filter((row) => isActiveOn(row))
    .length;

  const approvalStatusByFacility = await fetchApprovalStatusMap(
    supabase,
    "facility",
    facilities.map((facility) => facility.id)
  );
  const facilitiesWithApprovalStatus = facilities.map((facility) => ({
    ...facility,
    approval_status: approvalStatusByFacility.get(facility.id) ?? facility.approval_status,
  }));

  const determinationsByProductId = new Map<string, LiveDetermination | null>();
  const admissibilityByProductId = new Map<string, AdmissibilityBlock[]>();
  await Promise.all(products.map(async (product) => {
    if (!product.supplier_id) {
      determinationsByProductId.set(product.id, null);
    } else {
      determinationsByProductId.set(
        product.id,
        await fetchDetermination(supabase, importerId, product.supplier_id, product.id)
      );
    }
    admissibilityByProductId.set(
      product.id,
      await evaluateAdmissibility(supabase, {
        productId: product.id,
        commodityId: product.commodity_id,
        countryOfOrigin: product.country_of_origin,
      })
    );
  }));

  const { data: rawAttestations } = records.length > 0
    ? await (supabase.from("qi_attestations") as any)
        .select("fsvp_record_id, attestation_type, content_hash, revoked_at")
        .in("fsvp_record_id", records.map((record) => record.id))
    : { data: [] };

  const attestationRowsByRecordId = new Map<string, AttestationInput[]>();
  for (const row of (rawAttestations ?? []) as Array<AttestationInput & { fsvp_record_id: string | null }>) {
    if (!row.fsvp_record_id) continue;
    const existing = attestationRowsByRecordId.get(row.fsvp_record_id) ?? [];
    existing.push(row);
    attestationRowsByRecordId.set(row.fsvp_record_id, existing);
  }

  const gateBlocksByRecordId = new Map<string, GateBlock[]>();
  const attestationsByRecordId = new Map<string, AttestationEvaluation>();
  await Promise.all(records.map(async (record) => {
    const determination = determinationsByProductId.get(record.product_id) ?? null;
    const liveOutcome = determination && isDeterminationLive(determination)
      ? determination.outcome
      : null;
    const [gateBlocks, attestations] = await Promise.all([
      evaluateGates(supabase, {
        importerId,
        supplierId: record.supplier_id,
        fsvpRecordId: record.id,
        outcome: liveOutcome,
      }),
      evaluateAttestations(
        record,
        attestationRowsByRecordId.get(record.id) ?? [],
        liveOutcome
      ),
    ]);
    gateBlocksByRecordId.set(record.id, gateBlocks);
    attestationsByRecordId.set(record.id, attestations);
  }));

  return buildCompleteFsvpSetupPlan({
    suppliers,
    facilities: facilitiesWithApprovalStatus,
    facilityAccess,
    products,
    records,
    activeQiCount,
    packagesByRecordId,
    evidenceByRecordId,
    determinationsByProductId,
    admissibilityByProductId,
    gateBlocksByRecordId,
    attestationsByRecordId,
  });
}
