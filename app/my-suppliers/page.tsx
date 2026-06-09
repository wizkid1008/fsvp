import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LinkedSuppliersPanel } from "@/components/suppliers/LinkedSuppliersPanel";
import { LinkedExportersPanel } from "@/components/suppliers/LinkedExportersPanel";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Country } from "@/types/database";

export const runtime = "edge";

export default async function MySuppliersPage() {
  const { role, user } = await requireProfileRole("/my-suppliers", ["supplier", "administrator"]);
  const supabase = createServerSupabaseClient();

  const [{ data: profile }, { data: countries }] = await Promise.all([
    (supabase.from("profiles") as any)
      .select("supplier_id, organization_name, full_name")
      .eq("id", user.id)
      .maybeSingle(),
    (supabase.from("countries") as any)
      .select("country_code, country_name")
      .eq("is_active", true)
      .order("country_name"),
  ]);

  const supplierId: string | null = profile?.supplier_id ?? null;
  const countryOptions = (countries ?? []) as Pick<Country, "country_code" | "country_name">[];

  // Fetch linked upstream suppliers (exporter → supplier direction)
  const { data: rawLinks } = supplierId
    ? await (supabase.from("exporter_supplier_links") as any)
        .select(`
          id, status, invite_email, accepted_at, notes,
          supplier:supplier_id (
            id, company_name, country, approval_status, supplier_type
          )
        `)
        .eq("exporter_id", supplierId)
        .order("created_at", { ascending: false })
    : { data: [] };

  const linkedSuppliers = (rawLinks ?? []) as Array<{
    id: string;
    status: string;
    invite_email: string | null;
    accepted_at: string | null;
    notes: string | null;
    supplier: {
      id: string;
      company_name: string;
      country: string;
      approval_status: string;
      supplier_type: string | null;
    } | null;
  }>;

  return (
    <AppShell role={role}>
      <SectionHeader
        title="My Suppliers"
        description="Manage upstream suppliers that produce or process goods you export. Either party can upload evidence for shared facilities and products."
      />

      <div className="mt-6 space-y-6">
        {/* Upstream suppliers this exporter has linked */}
        <LinkedSuppliersPanel
          exporterId={supplierId}
          countries={countryOptions}
          linkedSuppliers={linkedSuppliers}
        />

        {/* Exporters this entity supplies to (two-way visibility) */}
        <LinkedExportersPanel
          supplierId={supplierId}
          supabase={supabase}
        />
      </div>
    </AppShell>
  );
}
