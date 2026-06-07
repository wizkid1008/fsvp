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

  const [{ data: rawFacilities }, { data: countries }, { data: suppliers }] = await Promise.all([
    (supabase.from("facilities_verify") as any)
      .select("id, facility_name, facility_type, fda_registration_number, food_safety_certifications, supplier_id, suppliers(company_name)")
      .order("created_at", { ascending: false }),
    (supabase.from("countries") as any)
      .select("country_code,country_name")
      .eq("is_active", true)
      .order("country_name"),
    (supabase.from("suppliers") as any)
      .select("id, company_name")
      .order("company_name")
  ]);

  const facilities = (rawFacilities ?? []) as unknown as FacilityRow[];
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
