import { AppShell } from "@/components/layout/AppShell";
import { ProductTable, type ProductRow } from "@/components/products/ProductTable";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { NextStepBanner } from "@/components/ui/NextStepBanner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScopeSwitcher } from "@/components/ui/ScopeSwitcher";
import type { StatusTone } from "@/types/platform";
import { SupplierContextSwitcher } from "@/components/suppliers/SupplierContextSwitcher";
import { getSupplierType } from "@/lib/supplier-context";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveEffectiveAccountContext } from "@/lib/preview-account-context";
import { fetchApprovalStatusMap } from "@/lib/scoring";
import { isTenantConfined } from "@/lib/auth/tenancy";
import type { Country } from "@/types/database";

export const runtime = "edge";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { view?: string; facility?: string };
}) {
  const { role, realRole, user } = await requireProfileRole("/products");
  const supabase = createServerSupabaseClient();
  const isSupplier = role === "supplier" || role === "exporter";
  const accountContext = await resolveEffectiveAccountContext({ realRole, role, supabase, user });
  const profile = accountContext.profile;

  const ownSupplierId: string = isSupplier
    ? (accountContext.supplierId ?? "00000000-0000-0000-0000-000000000000")
    : "";
  const importerId: string | null = !isSupplier
    ? accountContext.importerId
    : null;
  const importerScoped =
    !isSupplier &&
    (role === "us_importer" || isTenantConfined({ role, importer_id: accountContext.importerId }));

  // Context switcher: exporter can view a linked supplier's products via ?view=<id>
  const viewId = searchParams.view ?? "";
  let activeSupplierId = ownSupplierId;
  let viewingLinkedSupplier: { id: string; company_name: string } | null = null;

  if (isSupplier && ownSupplierId && viewId && viewId !== ownSupplierId) {
    const { data: link } = await (supabase.from("supplier_relationships") as any)
      .select("supplier_id, supplier:supplier_id(id, company_name)")
      .eq("relationship_type", "exporter_supplier")
      .eq("exporter_id", ownSupplierId)
      .eq("supplier_id", viewId)
      .eq("status", "active")
      .maybeSingle();

    if (link?.supplier) {
      activeSupplierId = viewId;
      viewingLinkedSupplier = link.supplier as { id: string; company_name: string };
    }
  }

  // Fetch linked suppliers for context switcher dropdown (include pending so products can be added before invite is accepted)
  const { data: linkedSupplierRows } = isSupplier && ownSupplierId
    ? await (supabase.from("supplier_relationships") as any)
        .select("supplier_id")
        .eq("relationship_type", "exporter_supplier")
        .eq("exporter_id", ownSupplierId)
        .in("status", ["active", "pending_invite"])
    : { data: [] };

  const linkedSupplierIdList = ((linkedSupplierRows ?? []) as Array<{ supplier_id: string | null }>)
    .map((r) => r.supplier_id)
    .filter(Boolean) as string[];

  let linkedSuppliers: Array<{ id: string; company_name: string }> = [];
  if (linkedSupplierIdList.length > 0) {
    const admin = createAdminSupabaseClient();
    const { data: supplierRows } = await (admin.from("suppliers") as any)
      .select("id, company_name")
      .in("id", linkedSupplierIdList);
    linkedSuppliers = (supplierRows ?? []) as Array<{ id: string; company_name: string }>;
  }

  let importerSupplierOptions: Array<{ id: string; company_name: string }> = [];
  if (importerScoped && importerId) {
    const admin = createAdminSupabaseClient();
    const { data: importerLinks } = await (admin.from("supplier_relationships") as any)
      .select("supplier_id")
      .eq("relationship_type", "importer_supplier")
      .eq("importer_id", importerId)
      .in("status", ["active", "pending_invite"]);

    const importerSupplierIds = ((importerLinks ?? []) as Array<{ supplier_id: string | null }>)
      .map((link) => link.supplier_id)
      .filter(Boolean) as string[];

    if (importerSupplierIds.length > 0) {
      const { data: importerSuppliers } = await (admin.from("suppliers") as any)
        .select("id, company_name")
        .in("id", importerSupplierIds)
        .order("company_name");
      importerSupplierOptions = (importerSuppliers ?? []) as Array<{ id: string; company_name: string }>;
    }
  }

  let productsQuery = (supabase.from("products_verify") as any)
    .select("id, product_name, product_description, country_of_origin, raw_or_processed, intended_use, ingredient_list, allergen_information, supplier_id, facility_id, commodity_id, approval_status, lifecycle, discontinued_on, suppliers(company_name), facilities_verify(facility_name), commodities(common_name, plant_part)")
    .order("created_at", { ascending: false });
  let suppliersQuery = (supabase.from("suppliers") as any)
    .select("id, company_name")
    .order("company_name");
  let facilitiesQuery = (supabase.from("facilities_verify") as any)
    .select("id, facility_name, supplier_id, facility_address_json")
    .order("facility_name");
  let facilityAccessQuery = (supabase.from("facility_supplier_access") as any)
    .select("facility_id, supplier_id")
    .order("created_at");

  if (isSupplier) {
    productsQuery  = productsQuery.eq("supplier_id", activeSupplierId);
    suppliersQuery = suppliersQuery.eq("id", activeSupplierId);
    facilityAccessQuery = facilityAccessQuery.eq("supplier_id", activeSupplierId);
  }

  const [productsRes, countriesRes, suppliersRes, facilitiesRes, facilityAccessRes, documentsRes] = await Promise.all([
    productsQuery,
    (supabase.from("countries") as any)
      .select("country_code,country_name")
      .eq("is_active", true)
      .order("country_name"),
    suppliersQuery,
    facilitiesQuery,
    facilityAccessQuery,
    supabase.from("documents")
      .select("linked_entity_type, linked_entity_id"),
  ]);

  const { data: rawProducts, error: productsError } = productsRes;
  const { data: countries } = countriesRes;
  const { data: suppliers } = suppliersRes;
  const { data: facilities } = facilitiesRes;
  const { data: facilityAccess } = facilityAccessRes;
  const { data: documents } = documentsRes;

  if (productsError) {
    console.error("products_verify query failed:", productsError);
  }

  const evidenceCountByProduct = new Map<string, number>();
  for (const doc of (documents ?? []) as Array<{ linked_entity_type: string | null; linked_entity_id: string | null }>) {
    if (doc.linked_entity_type === "product" && doc.linked_entity_id) {
      evidenceCountByProduct.set(doc.linked_entity_id, (evidenceCountByProduct.get(doc.linked_entity_id) ?? 0) + 1);
    }
  }

  let supplierOptions = (suppliers ?? []) as Array<{ id: string; company_name: string }>;
  if (importerScoped) {
    supplierOptions = importerSupplierOptions;
  }

  // Same fallback as Facilities — guarantee own supplier appears so Add Product button shows
  if (isSupplier && activeSupplierId && !supplierOptions.some((s) => s.id === activeSupplierId)) {
    const { data: ownSupplier } = await (supabase.from("suppliers") as any)
      .select("id, company_name")
      .eq("id", activeSupplierId)
      .maybeSingle();
    if (ownSupplier) supplierOptions = [ownSupplier, ...supplierOptions];
  }

  const accessByFacility = new Map<string, string[]>();
  for (const access of (facilityAccess ?? []) as Array<{ facility_id: string; supplier_id: string }>) {
    const existing = accessByFacility.get(access.facility_id) ?? [];
    existing.push(access.supplier_id);
    accessByFacility.set(access.facility_id, existing);
  }

  const countryOptions = (countries ?? []) as Pick<Country, "country_code" | "country_name">[];
  const importerSupplierIds = new Set(importerSupplierOptions.map((supplier) => supplier.id));
  const facilityOptions = ((facilities ?? []) as Array<{
    id: string;
    facility_name: string;
    supplier_id: string | null;
    facility_address_json: { country?: string } | null;
  }>)
    .map((facility) => ({
      id: facility.id,
      facility_name: facility.facility_name,
      supplier_id: facility.supplier_id,
      country: facility.facility_address_json?.country ?? null,
      supplier_ids: accessByFacility.get(facility.id) ?? (facility.supplier_id ? [facility.supplier_id] : []),
    }))
    .filter((facility) => {
      if (isSupplier) {
        return Boolean(activeSupplierId && facility.supplier_ids.includes(activeSupplierId));
      }
      if (importerScoped) {
        return facility.supplier_ids.some((supplierId) => importerSupplierIds.has(supplierId));
      }
      return true;
    });

  const requestedFacility = searchParams.facility
    ? facilityOptions.find((facility) => facility.id === searchParams.facility) ?? null
    : null;
  const productScopeFacility = requestedFacility;
  const productScopeFacilityId = productScopeFacility?.id ?? "";
  const importerFacilityIds = new Set(facilityOptions.map((facility) => facility.id));
  const productsBeforeStatus = ((rawProducts ?? []) as unknown as ProductRow[])
    .filter((product) =>
      productScopeFacilityId
        ? product.facility_id === productScopeFacilityId
        : !importerScoped ||
            Boolean(
              (product.facility_id && importerFacilityIds.has(product.facility_id)) ||
              (product.supplier_id && importerSupplierIds.has(product.supplier_id))
            )
    )
    .map((product) => ({
      ...product,
      evidence_count: evidenceCountByProduct.get(product.id) ?? 0,
    }));

  const productIds = productsBeforeStatus.map((product) => product.id);
  const { data: rawDeterminations, error: determinationsError } = productIds.length > 0 && !isSupplier
    ? await (supabase.from("admissibility_determinations_status") as any)
        .select("product_id, outcome, is_current, rule_superseded")
        .in("product_id", productIds)
        .is("superseded_at", null)
    : { data: [] };

  type DeterminationSummaryRow = {
    product_id: string;
    outcome: "permitted" | "restricted" | "prohibited";
    is_current: boolean;
    rule_superseded: boolean;
  };
  const determinationsByProduct = new Map<string, DeterminationSummaryRow[]>();
  for (const row of (rawDeterminations ?? []) as DeterminationSummaryRow[]) {
    const existing = determinationsByProduct.get(row.product_id) ?? [];
    existing.push(row);
    determinationsByProduct.set(row.product_id, existing);
  }

  function admissibilityStatus(product: ProductRow): ProductRow["admissibility_status"] {
    if (isSupplier) return "importer_review";
    if (!product.commodity_id) return "unclassified";
    if (!product.country_of_origin) return "action_required";
    if (determinationsError) return "action_required";
    const rows = determinationsByProduct.get(product.id) ?? [];
    if (rows.length === 0) return "not_determined";
    if (rows.some((row) => row.outcome === "prohibited")) return "prohibited";
    if (rows.some((row) => !row.is_current || row.rule_superseded)) return "action_required";
    if (rows.some((row) => row.outcome === "restricted")) return "restricted";
    return "permitted";
  }

  // products_verify.approval_status is never written by the app — the real
  // readiness state lives in scoring_results, resolved against approval_thresholds.
  const approvalStatusByProduct = await fetchApprovalStatusMap(
    supabase,
    "product",
    productsBeforeStatus.map((p) => p.id)
  );
  const products = productsBeforeStatus.map((p) => {
    const status = admissibilityStatus(p);
    const scoreStatus = approvalStatusByProduct.get(p.id) ?? p.approval_status;
    return {
      ...p,
      admissibility_status: status,
      // Suppliers cannot read importer-owned determinations. Preserve the
      // evidence status in their view rather than turning hidden data into a
      // false "not approved" assertion.
      approval_status: isSupplier || ["permitted", "restricted", "not_determined"].includes(status ?? "")
        ? scoreStatus
        : "not_approved",
    };
  });

  // "Unclassified" here means the two fields the admissibility gate needs, which
  // is what the setup planner's Classify step checks too.
  const unclassifiedCount = products.filter(
    (p: { commodity_id: string | null; country_of_origin: string | null }) =>
      !p.commodity_id || !p.country_of_origin
  ).length;

  const productsAdded = products.length;
  const productsApproved = products.filter((p) => p.approval_status === "importer_approved").length;
  const productsNeedingUpdates = products.filter((p) =>
    ["conditionally_approved", "needs_corrective_action", "rejected", "not_approved"].includes(p.approval_status ?? "")
  ).length;

  const metricTone = (v: number, warnAbove = 0): StatusTone =>
    v === 0 ? "neutral" : v > warnAbove ? "warning" : "success";
  const productScopeSupplierIds = new Set(productScopeFacility?.supplier_ids ?? []);
  const tableSuppliers = productScopeFacility
    ? supplierOptions.filter((supplier) => productScopeSupplierIds.has(supplier.id))
    : viewingLinkedSupplier
      ? [viewingLinkedSupplier]
      : [
          ...supplierOptions,
          ...linkedSuppliers.filter((s) => !supplierOptions.some((o) => o.id === s.id)),
        ];
  const tableFacilities = productScopeFacility ? [productScopeFacility] : facilityOptions;

  return (
    <AppShell role={role} realRole={realRole} supplierType={isSupplier ? await getSupplierType(supabase as any, ownSupplierId || null) : undefined}>
      <SectionHeader
        title={productScopeFacility
          ? `Products — ${productScopeFacility.facility_name}`
          : viewingLinkedSupplier
          ? `Products — ${viewingLinkedSupplier.company_name}`
          : "Products"}
        description="Track every supplier product by facility, ingredients, allergens, intended use, and origin."
      />

      {/* Steps 4-6 of the canonical path, and the largest cluster of blockers
          on a real tenant: a product cannot reach an FSVP record until it is
          classified and has an origin. The Admissibility column already says
          which ones — this says what to do about it. */}
      {!isSupplier && unclassifiedCount > 0 && (
        <NextStepBanner>
          {unclassifiedCount === 1
            ? "1 product still needs a commodity classification or a country of origin"
            : `${unclassifiedCount} products still need a commodity classification or a country of origin`}
          . Open a product from its name to set them — until then its admissibility cannot be
          determined, and no FSVP record can be opened for it.
        </NextStepBanner>
      )}

      {!isSupplier && products.length > 0 && unclassifiedCount === 0 && (
        <NextStepBanner action={{ label: "Determine applicability", href: "/applicability" }}>
          every product is classified. Next, determine whether FSVP applies to each one — an exempt
          food never needs a record, so this decides how much work the rest of the path is.
        </NextStepBanner>
      )}

      {/* Context switcher */}
      {isSupplier && linkedSuppliers.length > 0 && (
        <SupplierContextSwitcher
          ownId={ownSupplierId}
          ownLabel={accountContext.organizationName ?? profile?.organization_name ?? "My Products"}
          linkedSuppliers={linkedSuppliers}
          currentViewId={activeSupplierId}
          basePath="/products"
        />
      )}

      {importerScoped && facilityOptions.length > 0 && (
        <ScopeSwitcher
          basePath="/products"
          currentId={productScopeFacilityId}
          label="Viewing facility"
          options={[
            { id: "", label: "All linked facilities" },
            ...facilityOptions.map((facility) => ({
              id: facility.id,
              label: `${facility.facility_name} (${supplierOptions
                .filter((supplier) => facility.supplier_ids.includes(supplier.id))
                .map((supplier) => supplier.company_name)
                .join(", ") || "No exporter"})`,
            })),
          ]}
          param="facility"
        />
      )}

      {productsError && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Could not load products: {productsError.message}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Products Added", value: productsAdded, tone: "info" as StatusTone },
          { label: "Products Approved", value: productsApproved, tone: "success" as StatusTone },
          { label: "Products Needing Updates", value: productsNeedingUpdates, tone: metricTone(productsNeedingUpdates, 0) },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <p className="text-xs font-medium text-slate-500">{m.label}</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-3xl font-semibold text-ink">{m.value}</p>
              <StatusBadge tone={m.tone}>{m.value > 0 ? "Active" : "None"}</StatusBadge>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <ProductTable
          // Only the importing organization can say whether it imports a food.
          // /api/products/lifecycle enforces the same rule, so hiding the
          // control is a courtesy rather than the protection.
          canEditLifecycle={!isSupplier}
          // /api/exporters/create is hard-restricted to importers/admins — an
          // exporter viewing their own product list has exactly one supplier
          // (themselves) and no reason to add another.
          canManageExporters={!isSupplier}
          countries={countryOptions}
          facilities={tableFacilities}
          products={products}
          supplierHref={isSupplier ? "/my-suppliers" : "/exporters"}
          suppliers={tableSuppliers}
          // ?facility=<id> arrives from "Add product" on a facility's row.
          // Resolved against the facilities this account can actually see, so a
          // hand-edited URL cannot preselect another tenant's facility. The
          // exporter comes from the facility itself rather than the URL, so the
          // two cannot be made inconsistent.
          presetFacility={(() => {
            const match = requestedFacility;
            const supplierId = match?.supplier_id ?? match?.supplier_ids[0] ?? null;
            return match && supplierId ? { facilityId: match.id, supplierId } : null;
          })()}
        />
      </div>
    </AppShell>
  );
}
