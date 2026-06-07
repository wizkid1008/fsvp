import { FacilityTable, type FacilityRow } from "@/components/facilities/FacilityTable";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Country } from "@/types/database";

export const runtime = "edge";

export default async function FacilitiesPage() {
  const { role } = await requireProfileRole("/facilities");
  const supabase = createServerSupabaseClient();

  const [{ data: rawFacilities }, { data: countries }, { data: suppliers }, { data: documents }] = await Promise.all([
    (supabase.from("facilities_verify") as any)
      .select("id, facility_name, facility_type, facility_address_json, fda_registration_number, production_capacity, manufacturing_processes, food_safety_certifications, supplier_id, suppliers(company_name)")
      .order("created_at", { ascending: false }),
    (supabase.from("countries") as any)
      .select("country_code,country_name")
      .eq("is_active", true)
      .order("country_name"),
    (supabase.from("suppliers") as any)
      .select("id, company_name")
      .order("company_name"),
    supabase.from("documents")
      .select("linked_entity_type, linked_entity_id")
  ]);

  const evidenceCountByFacility = new Map<string, number>();
  for (const doc of (documents ?? []) as Array<{ linked_entity_type: string | null; linked_entity_id: string | null }>) {
    if (doc.linked_entity_type === "facility" && doc.linked_entity_id) {
      evidenceCountByFacility.set(doc.linked_entity_id, (evidenceCountByFacility.get(doc.linked_entity_id) ?? 0) + 1);
    }
  }

  const facilities = ((rawFacilities ?? []) as unknown as FacilityRow[]).map((facility) => ({
    ...facility,
    evidence_count: evidenceCountByFacility.get(facility.id) ?? 0
  }));
  const countryOptions = (countries ?? []) as Pick<Country, "country_code" | "country_name">[];
  const supplierOptions = (suppliers ?? []) as Array<{ id: string; company_name: string }>;

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Facilities"
        description="Manage manufacturing facilities, FDA registrations, processes, certifications, and production capacity."
      />
      <FacilityTable countries={countryOptions} facilities={facilities} suppliers={supplierOptions} />
    </AppShell>
  );
}
