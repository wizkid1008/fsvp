import { evaluateAdmissibility, type AdmissibilityBlock } from "@/lib/admissibility/gate";
import { fetchDetermination, isDeterminationLive, type LiveDetermination } from "@/lib/fsvp/applicability";
import { evaluateGates, type GateBlock } from "@/lib/fsvp/gates";
import { evaluateAttestations, type AttestationEvaluation, type AttestationInput } from "@/lib/fsvp/qi-attestation";
import { isActiveOn } from "@/lib/fsvp/qualified-individuals";

type SupabaseLike = { from: (table: string) => any };

export type SetupBlocker = {
  id: string;
  message: string;
  href: string;
  actionLabel: string;
};

export type SetupStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  blockers: SetupBlocker[];
};

export type SetupSummary = {
  exporters: number;
  facilities: number;
  products: number;
  records: number;
  approvedRecords: number;
  packages: number;
};

export type CompleteFsvpSetupPlan = {
  steps: SetupStep[];
  summary: SetupSummary;
};

type SupplierRow = { id: string; company_name: string; country: string | null };
type FacilityRow = { id: string; facility_name: string; supplier_id: string | null };
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

  steps.push({
    id: "exporter",
    title: "Create exporter",
    description: "Start with the foreign supplier/exporter your organization imports from.",
    href: "/suppliers",
    actionLabel: "Open exporters",
    blockers: input.suppliers.length === 0
      ? [blocker(
          "exporter-none",
          "No exporter is linked or managed yet. Create an exporter record, or link one who already has an account.",
          "/suppliers",
          "Create or link exporter"
        )]
      : [],
  });

  const facilityBlockers: SetupBlocker[] = [];
  if (input.suppliers.length === 0) {
    facilityBlockers.push(blocker(
      "facility-needs-exporter",
      "Create or link an exporter before adding a facility.",
      "/suppliers",
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
    id: "facility",
    title: "Add facility",
    description: "Identify the facility that manufactures, packs, holds, or handles the food.",
    href: "/facilities",
    actionLabel: "Open facilities",
    blockers: facilityBlockers,
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
        productBlockers.push(blocker(
          `product-link-${product.id}`,
          `${productLabel(product)} is missing its exporter or facility link.`,
          `/products/${product.id}`,
          "Fix product"
        ));
      }
    }
  }
  steps.push({
    id: "product",
    title: "Create product",
    description: "Create the food item and tie it to the correct exporter and facility.",
    href: "/products",
    actionLabel: "Open products",
    blockers: productBlockers,
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
    id: "classification",
    title: "Classify product",
    description: "Record commodity taxonomy and origin so admissibility can be determined.",
    href: "/products",
    actionLabel: "Review classifications",
    blockers: classificationBlockers,
  });

  const admissibilityBlockers: SetupBlocker[] = [];
  for (const product of input.products) {
    const blocks = input.admissibilityByProductId.get(product.id) ?? [];
    for (const [index, item] of blocks.entries()) {
      admissibilityBlockers.push(blocker(
        `admissibility-${product.id}-${item.code}-${index}`,
        `${productLabel(product)}: ${item.message}`,
        `/products/${product.id}`,
        item.code === "not_classified" ? "Classify product" : "Determine admissibility"
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
    id: "admissibility",
    title: "Determine admissibility",
    description: "Snapshot whether the commodity may enter from its recorded origin.",
    href: "/products",
    actionLabel: "Open products",
    blockers: admissibilityBlockers,
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
    id: "record",
    title: "Open FSVP record",
    description: "Determine whether FSVP applies, then open the importer-owned record when it does.",
    href: "/fsvp-records",
    actionLabel: "Open records",
    blockers: recordBlockers,
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
    id: "screening",
    title: "Screen compliance history",
    description: "A qualified individual records consideration of FDA compliance history.",
    href: "/compliance-history",
    actionLabel: "Open compliance history",
    blockers: screeningBlockers,
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
    id: "evidence",
    title: "Review evidence",
    description: "Attach accepted supplier documents to the record so the basis for approval is inspectable.",
    href: "/importer-review",
    actionLabel: "Review submissions",
    blockers: evidenceBlockers,
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
    id: "qi",
    title: "Complete QI attestations",
    description: "Current qualified individual signatures must cover the required determinations.",
    href: "/qualified-individuals",
    actionLabel: "Open QI register",
    blockers: qiBlockers,
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

    if (record.status === "importer_approved") continue;
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
    id: "approval",
    title: "Approve FSVP record",
    description: "Record the importer's approval decision only after the gates are clear.",
    href: "/fsvp-records",
    actionLabel: "Open records",
    blockers: approvalBlockers,
  });

  const packageBlockers: SetupBlocker[] = [];
  const approvedRecords = input.records.filter((r) => r.status === "importer_approved");
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
    id: "package",
    title: "Generate inspection package",
    description: "Assemble the printable record package used during an FDA records request.",
    href: "/reports",
    actionLabel: "Open reports",
    blockers: packageBlockers,
  });

  return {
    steps,
    summary: {
      exporters: input.suppliers.length,
      facilities: input.facilities.length,
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
          .select("id, facility_name, supplier_id")
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
    (supabase.from("fsvp_record_evidence") as any)
      .select("fsvp_record_id, documents!inner(evidence_status)"),
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
    facilities,
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
