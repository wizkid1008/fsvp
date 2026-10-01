import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ProductStandingsProvider, ProductWhatsLeft } from "@/components/products/ProductStandings";
import {
  AdmissibilityPanel,
  type AdmissibilityDeterminationRow,
  type ClassificationRequestRow,
  type ProductCommodityOption,
} from "@/components/products/AdmissibilityPanel";
import { ProductFdaCodeCard } from "@/components/products/ProductFdaCodeCard";
import {
  ProductFacilityAssignmentPanel,
  type ProductFacilityOption,
} from "@/components/products/ProductFacilityAssignmentPanel";
import { RequiredEvidenceChecklist } from "@/components/evidence/RequiredEvidenceChecklist";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupplierType } from "@/lib/supplier-context";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { evaluateAdmissibility, hardAdmissibilityBlocks } from "@/lib/admissibility/gate";
import { fetchApprovalStatusMap } from "@/lib/scoring";
import { approvalTone, evidenceScoreLabel, NOT_ASSESSED } from "@/lib/approval/status";
import { fetchDetermination } from "@/lib/fsvp/applicability";
import { ApplicabilityCard } from "@/components/fsvp/ApplicabilityCard";
import { ChevronRight } from "lucide-react";
import { DetailFacts, DetailSection } from "@/components/ui/DetailSection";
import {
  ProductCompositionFacts,
  ProductImportStatus,
  ProductSectionEditButton,
} from "@/components/products/ProductDetailActions";
import type { ProductRow } from "@/components/products/ProductTable";

export const runtime = "edge";

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const { role, realRole, user } = await requireProfileRole(`/products/${params.id}`);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id, importer_id")
    .eq("id", user.id)
    .maybeSingle();
  const ownSupplierId: string | null =
    role === "supplier" ? resolvePreviewedAccountId(realRole, profile?.supplier_id ?? null) : null;

  const { data: product } = await (supabase.from("products_verify") as any)
    .select("id, product_name, product_description, ingredient_list, allergen_information, lifecycle, discontinued_on, approval_status, supplier_id, facility_id, commodity_id, country_of_origin, intended_use, raw_or_processed, suppliers(company_name), facilities_verify(facility_name), commodities(common_name, scientific_name, plant_part, is_propagative)")
    .eq("id", params.id)
    .maybeSingle();

  if (!product) notFound();

  const isSupplierView = role === "supplier" || role === "exporter";
  const { data: productFdaCode, error: productFdaCodeError } = !isSupplierView
    ? await (supabase.from("products_verify") as any)
        .select("fda_product_code, fda_subclass_code, fda_pic_code, fda_product_code_verified_at")
        .eq("id", params.id)
        .maybeSingle()
    : { data: null, error: null };
  const hasFdaCodeColumns = !productFdaCodeError;
  // The exporter's facilities feed both the unassigned-facility panel and the
  // Basics edit form, which checks the chosen facility belongs to the exporter
  // and takes its country as the origin.
  const assignableFacilities = product.supplier_id
    ? await fetchAssignableFacilities(supabase as any, product.supplier_id)
    : [];
  const { data: countryRows } = await (supabase.from("countries") as any)
    .select("country_code,country_name")
    .eq("is_active", true)
    .order("country_name");

  const [commoditiesResult, determinationsResult, scoreStatusMap, admissibilityBlocks, requestResult, ruleCountResult] = await Promise.all([
    (supabase.from("commodities") as any)
      .select("id, common_name, scientific_name, plant_part, is_propagative")
      .eq("active", true)
      .order("common_name"),
    (supabase.from("admissibility_determinations_status") as any)
      .select("id, intended_use, processing_state, outcome, citation, source_url, conditions, determined_at, expires_at, is_current, rule_superseded")
      .eq("product_id", params.id)
      .is("superseded_at", null)
      .order("determined_at", { ascending: false }),
    fetchApprovalStatusMap(supabase as any, "product", [params.id]),
    isSupplierView
      ? Promise.resolve([])
      : evaluateAdmissibility(supabase as any, {
          productId: params.id,
          commodityId: product.commodity_id,
          countryOfOrigin: product.country_of_origin,
        }),
    // Only the latest matters. A declined request followed by a better one
    // should show the newer answer, not the older refusal.
    (supabase.from("commodity_classification_requests") as any)
      .select("id, status, described_as, resolution_note, resolved_commodity_id, created_at, commodities:resolved_commodity_id(common_name)")
      .eq("product_id", params.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Is there anything at all to determine against? Counted rather than
    // resolved: the panel only needs to know whether offering the button could
    // lead anywhere, and the resolver still applies every refusal it always
    // did — draft, overdue, region-scoped, source moved — once one exists.
    product.commodity_id
      ? (supabase.from("country_commodity_rules") as any)
          .select("id", { count: "exact", head: true })
          .eq("commodity_id", product.commodity_id)
          .is("superseded_at", null)
      : Promise.resolve({ count: 0 }),
  ]);

  // An unreadable count must not withhold the form — that would turn a
  // transient read failure into a missing button with no explanation. Only a
  // confirmed zero hides it.
  const hasReferenceRule = (ruleCountResult as { count: number | null }).count !== 0;

  // Unscored is "not assessed", never the stale column — the Products list
  // shows the same. See lib/approval/status.ts.
  const scoredStatus = scoreStatusMap.get(params.id) ?? NOT_ASSESSED;
  const hardBlocks = hardAdmissibilityBlocks(admissibilityBlocks);
  const gatedStatus = hardBlocks.length > 0 ? "not_approved" : scoredStatus;
  const commodity = product.commodities as {
    common_name: string;
    scientific_name: string | null;
    plant_part: string | null;
    is_propagative: boolean;
  } | null;
  const commodityName = commodity
    ? [
        commodity.common_name,
        commodity.plant_part && commodity.plant_part !== "not_applicable" ? `(${commodity.plant_part})` : null,
        commodity.is_propagative ? "— propagative" : null,
      ].filter(Boolean).join(" ")
    : null;
  const canManageAdmissibility = realRole === "us_importer" && Boolean(profile?.importer_id);
  // An administrator previewing an importer may classify and record the FDA
  // product code (factual edits, audited as theirs — see app/api/products/
  // classify and fda-code) but not record the importer's admissibility
  // determination.
  const isAdminPreviewingImporter = realRole === "administrator" && Boolean(resolvePreviewedAccountId(realRole, null));
  const canClassify = canManageAdmissibility || isAdminPreviewingImporter;

  const rawRequest = requestResult?.data as
    | (Omit<ClassificationRequestRow, "resolved_commodity_name"> & { commodities: { common_name: string } | null })
    | null
    | undefined;
  const classificationRequest: ClassificationRequestRow | null = rawRequest
    ? {
        id: rawRequest.id,
        status: rawRequest.status,
        described_as: rawRequest.described_as,
        resolution_note: rawRequest.resolution_note,
        resolved_commodity_id: rawRequest.resolved_commodity_id,
        resolved_commodity_name: rawRequest.commodities?.common_name ?? null,
        created_at: rawRequest.created_at,
      }
    : null;
  const defaultUse = product.intended_use === "ready_to_eat"
    ? "consumption"
    : ["further_processed", "ingredient"].includes(product.intended_use ?? "")
      ? "processing"
      : "";


  // How FSVP applies to this food, shown before the work it governs rather than
  // below it on the record page. Only for the importer who owns the
  // determination -- an exporter viewing their own product has no standing to
  // make one, and the pair is keyed on the importer.
  const applicabilityDetermination =
    !isSupplierView && profile?.importer_id && product.supplier_id
      ? await fetchDetermination(supabase, profile.importer_id, product.supplier_id, params.id)
      : null;

  // The product as the edit form expects it, and the options it may choose
  // from: its own exporter (moving a product between exporters is refused by
  // /api/products/save) and that exporter's facilities.
  const productRow = product as ProductRow;
  const formSuppliers = product.supplier_id
    ? [{ id: product.supplier_id, company_name: product.suppliers?.company_name ?? "This exporter" }]
    : [];
  const formFacilities = assignableFacilities.map((facility) => ({
    ...facility,
    supplier_id: product.supplier_id,
    supplier_ids: [product.supplier_id],
  }));
  const countries = (countryRows ?? []) as Array<{ country_code: string; country_name: string }>;
  const editProps = { product: productRow, suppliers: formSuppliers, facilities: formFacilities, countries };

  const basicsDone = Boolean(product.facility_id && product.country_of_origin);
  const classificationDone = Boolean(product.commodity_id) && hardBlocks.length === 0;
  const compositionDone = Boolean(product.intended_use && product.raw_or_processed);

  return (
    <AppShell role={role} realRole={realRole} supplierType={await getSupplierType(supabase as any, ownSupplierId)}>
      {/* Where this product sits: exporter › facility › product, as on the
          exporter and facility pages. */}
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <Link href="/products" className="hover:text-forest hover:underline">Products</Link>
        {product.supplier_id && product.suppliers?.company_name && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            {isSupplierView ? (
              <span>{product.suppliers.company_name}</span>
            ) : (
              <Link href={`/exporters/${product.supplier_id}`} className="hover:text-forest hover:underline">
                {product.suppliers.company_name}
              </Link>
            )}
          </>
        )}
        {product.facility_id && product.facilities_verify?.facility_name && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href={`/facilities/${product.facility_id}`} className="hover:text-forest hover:underline">
              {product.facilities_verify.facility_name}
            </Link>
          </>
        )}
      </nav>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title={product.product_name} description="" />
        <div className="flex flex-wrap items-center gap-3">
          {/* Whether it is imported at all is a property of the product as a
              whole, so it sits with the name rather than in a section. */}
          <ProductImportStatus
            // /api/products/lifecycle refuses preview writes, so an
            // administrator is not offered a Change that can only fail.
            canEdit={!isSupplierView && realRole !== "administrator"}
            product={{
              id: product.id,
              product_name: product.product_name,
              lifecycle: product.lifecycle ?? "active",
              discontinued_on: product.discontinued_on ?? null,
            }}
          />
          <StatusBadge tone={approvalTone(gatedStatus)}>
            {/* A document score, so it is labelled as one — "Approved" is the FSVP
                standing the Products list and dashboard show. */}
            Evidence: {evidenceScoreLabel(gatedStatus)}
          </StatusBadge>
        </div>
      </div>

      {/* What is left for this product, from the same planner the Products
          list's "Why?" rows read — so the answer here and there is the same. */}
      {!isSupplierView && profile?.importer_id && (
        <ProductStandingsProvider>
          <ProductWhatsLeft productId={product.id} />
        </ProductStandingsProvider>
      )}

      {/* The product's details in pipeline order, each with its own Edit —
          replacing one long form on the list plus panels scattered below. */}
      <div className="mt-6 space-y-6">
        <DetailSection
          title="Basics"
          done={basicsDone}
          hint={!product.facility_id ? "no facility yet" : "origin missing"}
          action={<ProductSectionEditButton section="basics" {...editProps} />}
        >
          <DetailFacts
            facts={[
              { label: "Exporter", value: product.suppliers?.company_name ?? "Not set" },
              { label: "Facility", value: product.facilities_verify?.facility_name ?? "Not yet assigned" },
              { label: "Country of origin", value: product.country_of_origin ? `${product.country_of_origin} (from the facility)` : "Comes from the facility" },
            ]}
          />
          {!product.facility_id && (
            <div className="mt-4">
              <ProductFacilityAssignmentPanel
                productId={params.id}
                facilities={assignableFacilities}
                supplierId={product.supplier_id}
                countries={countries}
              />
            </div>
          )}
        </DetailSection>

        {/* Before classification: intended use and processing state are what
            the admissibility question is asked about (defaultUse below). */}
        <DetailSection
          title="Composition"
          done={compositionDone}
          hint="intended use or processing state not set"
          action={<ProductSectionEditButton section="composition" {...editProps} />}
        >
          <ProductCompositionFacts product={productRow} />
        </DetailSection>

        <DetailSection
          title="Classification and admissibility"
          done={isSupplierView ? null : classificationDone}
          hint={!product.commodity_id ? "classify it to determine admissibility" : "admissibility blocked"}
        >
          {isSupplierView ? (
            <DetailFacts facts={[{ label: "Commodity", value: commodityName ?? "Not classified" }]} />
          ) : (
          <div className="space-y-6">
            {/* The panels below only offer Classify / Determine to the
                importer's own users, so without this the heading asks for an
                action the page never offers. */}
            {!canManageAdmissibility && (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {isAdminPreviewingImporter
                  ? "You're previewing as an administrator. You can classify the product and record its FDA product code (both recorded as done by an administrator), but the admissibility determination is the importer's own answer and has to be recorded by their users."
                  : "Classifying the product and recording admissibility are done by the importer's users."}
              </p>
            )}
            <AdmissibilityPanel
              productId={params.id}
              productName={product.product_name}
              commodityId={product.commodity_id}
              commodityName={commodityName}
              countryOfOrigin={product.country_of_origin}
              commodities={(commoditiesResult.data ?? []) as ProductCommodityOption[]}
              determinations={(determinationsResult.data ?? []) as AdmissibilityDeterminationRow[]}
              blockers={admissibilityBlocks}
              canManage={canManageAdmissibility}
              canClassify={canClassify}
              defaultUse={defaultUse}
              defaultState=""
              classificationRequest={classificationRequest}
              hasReferenceRule={hasReferenceRule}
            />

          {hasFdaCodeColumns && (
            <ProductFdaCodeCard
              productId={params.id}
              productName={product.product_name}
              commodityName={commodity?.common_name ?? null}
              canManage={canClassify}
              current={{
                code:        productFdaCode?.fda_product_code ?? null,
                subclass:    productFdaCode?.fda_subclass_code ?? null,
                pic:         productFdaCode?.fda_pic_code ?? null,
                verified_at: productFdaCode?.fda_product_code_verified_at ?? null,
              }}
            />
          )}
          </div>
          )}
        </DetailSection>

        {!isSupplierView && profile?.importer_id && (
          <DetailSection title="FSVP applicability">
            <ApplicabilityCard determination={applicabilityDetermination} />
          </DetailSection>
        )}

        <DetailSection id="documents" title="Documents">
          <p className="-mt-2 mb-4 text-sm text-slate-500">
            The records this product needs. Create platform-authored records where available, or upload an
            existing document next to any missing or returned item.
          </p>
          {/* There was a "Product Readiness Score" ring beside this list. It
              counted only uploaded documents, not the platform-authored hazard
              analysis records the list counts, so it read 0% beside a bar
              saying "2 approved". The bar is the accurate measure and "What's
              left" at the top of the page says what blocks the product, so the
              ring was dropped rather than fixed. */}
          <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
            <div className="min-w-0 p-4 [&>*:first-child]:mt-0">
              <RequiredEvidenceChecklist
                linkType="product"
                entityId={params.id}
                supplierId={product.supplier_id}
                supabase={supabase}
                allowGeneratedActions={!isSupplierView}
                importerId={profile?.importer_id ?? null}
              />
            </div>
          </div>
        </DetailSection>
      </div>
    </AppShell>
  );
}

async function fetchAssignableFacilities(
  supabase: { from: (table: string) => any },
  supplierId: string
): Promise<ProductFacilityOption[]> {
  const [directRes, accessRes] = await Promise.all([
    (supabase.from("facilities_verify") as any)
      .select("id, facility_name, facility_address_json")
      .eq("supplier_id", supplierId)
      .order("facility_name"),
    (supabase.from("facility_supplier_access") as any)
      .select("facilities_verify(id, facility_name, facility_address_json)")
      .eq("supplier_id", supplierId),
  ]);

  type FacilityRow = {
    id: string;
    facility_name: string;
    facility_address_json: { country?: string } | null;
  };
  type AccessRow = { facilities_verify: FacilityRow | null };

  const byId = new Map<string, ProductFacilityOption>();
  function add(row: FacilityRow | null | undefined) {
    if (!row) return;
    byId.set(row.id, {
      id: row.id,
      facility_name: row.facility_name,
      country: row.facility_address_json?.country ?? null,
    });
  }

  for (const row of (directRes.data ?? []) as FacilityRow[]) add(row);
  for (const row of (accessRes.data ?? []) as AccessRow[]) add(row.facilities_verify);

  return [...byId.values()].sort((a, b) => a.facility_name.localeCompare(b.facility_name));
}
