import { AppShell } from "@/components/layout/AppShell";
import { ProductTable, type ProductRow } from "@/components/products/ProductTable";
import { SectionReadinessList } from "@/components/readiness/SectionReadinessList";
import { SectionHeader } from "@/components/ui/SectionHeader";
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
    const { data: link } = await (supabase.from("exporter_supplier_links") as any)
      .select("supplier_id, supplier:supplier_id(id, company_name)")
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
    ? await (supabase.from("exporter_supplier_links") as any)
        .select("supplier:supplier_id(id, company_name)")
        .eq("exporter_id", ownSupplierId)
        .eq("status", "active")
    : { data: [] };

  const linkedSuppliers = ((linkedSupplierRows ?? []) as Array<{
    supplier: { id: string; company_name: string } | null;
  }>)
    .map((r) => r.supplier)
    .filter(Boolean) as Array<{ id: string; company_name: string }>;

  let productsQuery = (supabase.from("products_verify") as any)
    .select("id, product_name, product_description, country_of_origin, raw_or_processed, intended_use, ingredient_list, allergen_information, supplier_id, facility_id, suppliers(company_name), facilities_verify(facility_name)")
    .order("created_at", { ascending: false });
  let suppliersQuery = (supabase.from("suppliers") as any)
    .select("id, company_name")
    .order("company_name");
  let facilitiesQuery = (supabase.from("facilities_verify") as any)
    .select("id, facility_name, supplier_id")
    .order("facility_name");
  let facilityAccessQuery = (supabase.from("facility_supplier_access") as any)
    .select("facility_id, supplier_id")
    .order("created_at");

  if (isSupplier) {
    productsQuery  = productsQuery.eq("supplier_id", activeSupplierId);
    suppliersQuery = suppliersQuery.eq("id", activeSupplierId);
    facilityAccessQuery = facilityAccessQuery.eq("supplier_id", activeSupplierId);
  }

  const [{ data: rawProducts }, { data: countries }, { data: suppliers }, { data: facilities }, { data: facilityAccess }, { data: documents }] = await Promise.all([
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
  const facilityOptions = ((facilities ?? []) as Array<{ id: string; facility_name: string; supplier_id: string | null }>)
    .map((facility) => ({
      ...facility,
      supplier_ids: accessByFacility.get(facility.id) ?? (facility.supplier_id ? [facility.supplier_id] : []),
    }))
    .filter((facility) => !isSupplier || Boolean(activeSupplierId && facility.supplier_ids.includes(activeSupplierId)));

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

      {isSupplier && (
        <div className="mt-6">
          <SectionReadinessList
            appliesTo="product"
            emptyText="Product readiness requirements are not configured yet."
            supplierId={activeSupplierId}
            supabase={supabase}
            title="Product Readiness Requirements"
          />
        </div>
      )}

      <div className="mt-6">
        <ProductTable
          countries={countryOptions}
          facilities={facilityOptions}
          products={products}
          suppliers={supplierOptions}
        />
      </div>
    </AppShell>
  );
}
