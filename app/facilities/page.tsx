import { FacilityTable, type FacilityRow } from "@/components/facilities/FacilityTable";
import { AppShell } from "@/components/layout/AppShell";
import { SectionReadinessList } from "@/components/readiness/SectionReadinessList";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Country } from "@/types/database";

export const runtime = "edge";

export default async function FacilitiesPage() {
  const { role, user } = await requireProfileRole("/facilities");
  const supabase = createServerSupabaseClient();
  const isSupplier = role === "supplier";
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id")
    .eq("id", user.id)
    .maybeSingle();
  const supplierId = isSupplier ? profile?.supplier_id ?? "" : "";

  let suppliersQuery = (supabase.from("suppliers") as any)
    .select("id, company_name")
    .order("company_name");
  let accessQuery = (supabase.from("facility_supplier_access") as any)
    .select("facility_id, supplier_id")
    .order("created_at");

  if (isSupplier && supplierId) {
    suppliersQuery = suppliersQuery.eq("id", supplierId);
    accessQuery = accessQuery.eq("supplier_id", supplierId);
  }

  const [{ data: rawFacilities }, { data: countries }, { data: suppliers }, { data: accessRows }, { data: documents }] = await Promise.all([
    (supabase.from("facilities_verify") as any)
      .select("id, facility_name, facility_type, facility_address_json, fda_registration_number, production_capacity, manufacturing_processes, food_safety_certifications, supplier_id, suppliers(company_name)")
      .order("created_at", { ascending: false }),
    (supabase.from("countries") as any)
      .select("country_code,country_name")
      .eq("is_active", true)
      .order("country_name"),
    suppliersQuery,
    accessQuery,
    supabase.from("documents")
      .select("linked_entity_type, linked_entity_id")
  ]);

  const evidenceCountByFacility = new Map<string, number>();
  for (const doc of (documents ?? []) as Array<{ linked_entity_type: string | null; linked_entity_id: string | null }>) {
    if (doc.linked_entity_type === "facility" && doc.linked_entity_id) {
      evidenceCountByFacility.set(doc.linked_entity_id, (evidenceCountByFacility.get(doc.linked_entity_id) ?? 0) + 1);
    }
  }

  const supplierOptions = (suppliers ?? []) as Array<{ id: string; company_name: string }>;
  const supplierById = new Map(supplierOptions.map((supplier) => [supplier.id, supplier.company_name]));
  const accessByFacility = new Map<string, string[]>();

  for (const access of (accessRows ?? []) as Array<{ facility_id: string; supplier_id: string }>) {
    const existing = accessByFacility.get(access.facility_id) ?? [];
    existing.push(access.supplier_id);
    accessByFacility.set(access.facility_id, existing);
  }

  const facilities = ((rawFacilities ?? []) as unknown as FacilityRow[])
    .map((facility) => {
      const supplierIds = accessByFacility.get(facility.id) ?? (facility.supplier_id ? [facility.supplier_id] : []);
      return {
        ...facility,
        supplier_ids: supplierIds,
        supplier_names: supplierIds.map((id) => supplierById.get(id)).filter(Boolean) as string[],
        evidence_count: evidenceCountByFacility.get(facility.id) ?? 0
      };
    })
    .filter((facility) => !isSupplier || Boolean(supplierId && facility.supplier_ids.includes(supplierId)));
  const countryOptions = (countries ?? []) as Pick<Country, "country_code" | "country_name">[];

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Facilities"
        description="Manage manufacturing facilities, FDA registrations, processes, certifications, and production capacity."
      />
      {isSupplier ? (
        <div className="mt-6">
          <SectionReadinessList
            appliesTo="facility"
            emptyText="Facility readiness requirements are not configured yet."
            supplierId={supplierId}
            supabase={supabase}
            title="Facility Readiness Requirements"
          />
        </div>
      ) : null}
      <div className="mt-6">
      <FacilityTable countries={countryOptions} facilities={facilities} suppliers={supplierOptions} />
      </div>
    </AppShell>
  );
}
