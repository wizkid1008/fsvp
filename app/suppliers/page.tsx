import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SupplierTable, type SupplierRow } from "@/components/suppliers/SupplierTable";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "edge";

export default async function SuppliersPage() {
  const { role } = await requireProfileRole("/suppliers");
  const supabase = createServerSupabaseClient();

  const { data: rawSuppliers } = await (supabase.from("suppliers") as any)
    .select("id, company_name, country, approval_status, certification_status, fda_registration_number, contact_json, updated_at")
    .order("updated_at", { ascending: false });

  const suppliers = (rawSuppliers ?? []) as SupplierRow[];

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Suppliers"
        description="Manage your foreign supplier records, contacts, approval status, and FSVP compliance standing."
      />
      <SupplierTable suppliers={suppliers ?? []} />
    </AppShell>
  );
}
