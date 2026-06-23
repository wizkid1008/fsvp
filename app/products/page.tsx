import { AppShell } from "@/components/layout/AppShell";
import { ProductTable, type ProductRow } from "@/components/products/ProductTable";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";
import { SupplierContextSwitcher } from "@/components/suppliers/SupplierContextSwitcher";
import { getSupplierType } from "@/lib/supplier-context";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Country } from "@/types/database";

export const runtime = "edge";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const { role, user } = await requireProfileRole("/products");
  const supabase = createServerSupabaseClient();
  const isSupplier = role === "supplier";

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id, organization_name")
    .eq("id", user.id)
    .maybeSingle();

  const ownSupplierId: string = isSupplier
    ? (profile?.supplier_id ?? "00000000-0000-0000-0000-000000000000")
    : "";

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

  // Fetch linked suppliers for context switcher dropdown
  const { data: linkedSupplierRows } = isSupplier && ownSupplierId
    ? await (supabase.from("supplier_relationships") as any)
        .select("supplier:supplier_id(id, company_name)")
        .eq("relationship_type", "exporter_supplier")
        .eq("exporter_id", ownSupplierId)
        .eq("status", "active")
    : { data: [] };

  const linkedSuppliers = ((linkedSupplierRows ?? []) as Array<{
    supplier: { id: string; company_name: string } | null;
  }>)
    .map((r) => r.supplier)
    .filter(Boolean) as Array<{ id: string; company_name: string }>;

  let productsQuery = (supabase.from("products_verify") as any)
    .select("id, product_name, product_description, country_of_origin, raw_or_processed, intended_use, ingredient_list, allergen_information, supplier_id, facility_id, approval_status, suppliers(company_name), facilities_verify(facility_name)")
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

  const products = ((rawProducts ?? []) as unknown as ProductRow[]).map((product) => ({
    ...product,
    evidence_count: evidenceCountByProduct.get(product.id) ?? 0,
  }));

  let supplierOptions = (suppliers ?? []) as Array<{ id: string; company_name: string }>;

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

  const countryOptions  = (countries ?? []) as Pick<Country, "country_code" | "country_name">[];
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
    .filter((facility) => !isSupplier || Boolean(activeSupplierId && facility.supplier_ids.includes(activeSupplierId)));

  const productsAdded = products.length;
  const productsApproved = products.filter((p) => p.approval_status === "approved").length;
  const productsNeedingUpdates = products.filter((p) =>
    ["improvement_required", "not_approved", "conditionally_approved"].includes(p.approval_status ?? "")
  ).length;

  const metricTone = (v: number, warnAbove = 0): StatusTone =>
    v === 0 ? "neutral" : v > warnAbove ? "warning" : "success";

  return (
    <AppShell role={role} supplierType={isSupplier ? await getSupplierType(supabase as any, ownSupplierId || null) : undefined}>
      <SectionHeader
        title={viewingLinkedSupplier
          ? `Products — ${viewingLinkedSupplier.company_name}`
          : "Products"}
        description="Track every supplier product by facility, ingredients, allergens, intended use, and origin."
      />

      {/* Context switcher */}
      {isSupplier && linkedSuppliers.length > 0 && (
        <SupplierContextSwitcher
          ownId={ownSupplierId}
          ownLabel={profile?.organization_name ?? "My Products"}
          linkedSuppliers={linkedSuppliers}
          currentViewId={activeSupplierId}
          basePath="/products"
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
          countries={countryOptions}
          facilities={facilityOptions}
          products={products}
          supplierHref={isSupplier ? "/my-suppliers" : "/suppliers"}
          suppliers={viewingLinkedSupplier
            ? [viewingLinkedSupplier]
            : [
                ...supplierOptions,
                ...linkedSuppliers.filter((s) => !supplierOptions.some((o) => o.id === s.id)),
              ]}
        />
      </div>
    </AppShell>
  );
}
