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

  const [{ data: rawSuppliers }, { data: countries }] = await Promise.all([
    (supabase.from("suppliers") as any)
      .select("id, company_name, country, approval_status, certification_status, fda_registration_number, contact_json, updated_at")
      .order("updated_at", { ascending: false }),
    (supabase.from("countries") as any)
      .select("country_code,country_name")
      .eq("is_active", true)
      .order("country_name")
  ]);

  const suppliers = (rawSuppliers ?? []) as SupplierRow[];
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
