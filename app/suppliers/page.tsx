import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SupplierTable, type SupplierRow } from "@/components/suppliers/SupplierTable";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Country } from "@/types/database";

export const runtime = "edge";

export default async function SuppliersPage() {
  const { role } = await requireProfileRole("/suppliers");
  const supabase = createServerSupabaseClient();

  const [{ data: rawSuppliers }, { data: countries }, { data: products }, { data: facilities }, { data: facilityAccess }, { data: documents }] = await Promise.all([
    (supabase.from("suppliers") as any)
      .select("id, company_name, legal_entity_name, country, website, approval_status, certification_status, fda_registration_number, contact_json, supplier_type, updated_at")
      // Only show export-eligible suppliers on the importer Suppliers page.
      // Manufacturers/brokers are upstream of exporters and not directly the importer's concern.
      .in("supplier_type", ["exporter", "exporter_manufacturer", "trader"])
      .order("updated_at", { ascending: false }),
    (supabase.from("countries") as any)
      .select("country_code,country_name")
      .eq("is_active", true)
      .order("country_name"),
    (supabase.from("products_verify") as any)
      .select("id, supplier_id"),
    (supabase.from("facilities_verify") as any)
      .select("id, supplier_id"),
    (supabase.from("facility_supplier_access") as any)
      .select("facility_id, supplier_id"),
    supabase.from("documents")
      .select("linked_entity_type, linked_entity_id")
  ]);

  const productSupplier = new Map(((products ?? []) as Array<{ id: string; supplier_id: string | null }>).map((product) => [product.id, product.supplier_id]));
  const facilitySuppliers = new Map<string, string[]>();
  for (const facility of (facilities ?? []) as Array<{ id: string; supplier_id: string | null }>) {
    if (facility.supplier_id) facilitySuppliers.set(facility.id, [facility.supplier_id]);
  }
  for (const access of (facilityAccess ?? []) as Array<{ facility_id: string; supplier_id: string }>) {
    const existing = facilitySuppliers.get(access.facility_id) ?? [];
    if (!existing.includes(access.supplier_id)) existing.push(access.supplier_id);
    facilitySuppliers.set(access.facility_id, existing);
  }
  const evidenceCountBySupplier = new Map<string, number>();

  for (const doc of (documents ?? []) as Array<{ linked_entity_type: string | null; linked_entity_id: string | null }>) {
    if (!doc.linked_entity_id) continue;
    let supplierId: string | null | undefined = null;

    if (doc.linked_entity_type === "supplier" || doc.linked_entity_type === "foreign_supplier") {
      supplierId = doc.linked_entity_id;
    } else if (doc.linked_entity_type === "product") {
      supplierId = productSupplier.get(doc.linked_entity_id);
    } else if (doc.linked_entity_type === "facility") {
      const supplierIds = facilitySuppliers.get(doc.linked_entity_id) ?? [];
      for (const id of supplierIds) {
        evidenceCountBySupplier.set(id, (evidenceCountBySupplier.get(id) ?? 0) + 1);
      }
      continue;
    }

    if (supplierId) {
      evidenceCountBySupplier.set(supplierId, (evidenceCountBySupplier.get(supplierId) ?? 0) + 1);
    }
  }

  const suppliers = ((rawSuppliers ?? []) as SupplierRow[]).map((supplier) => ({
    ...supplier,
    evidence_count: evidenceCountBySupplier.get(supplier.id) ?? 0
  }));
  const countryOptions = (countries ?? []) as Pick<Country, "country_code" | "country_name">[];

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Suppliers"
        description="Manage your foreign supplier records, contacts, approval status, and FSVP compliance standing."
      />
      <SupplierTable countries={countryOptions} suppliers={suppliers ?? []} />
    </AppShell>
  );
}
