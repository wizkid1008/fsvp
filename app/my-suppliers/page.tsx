import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LinkedSuppliersPanel } from "@/components/suppliers/LinkedSuppliersPanel";
import { LinkedExportersPanel } from "@/components/suppliers/LinkedExportersPanel";
import { getSupplierType } from "@/lib/supplier-context";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import type { Country } from "@/types/database";

export const runtime = "edge";

export default async function MySuppliersPage() {
  const { role, realRole, user } = await requireProfileRole("/my-suppliers", ["exporter", "administrator"]);
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

  const supplierId: string | null = resolvePreviewedAccountId(realRole, profile?.supplier_id ?? null);
  const countryOptions = (countries ?? []) as Pick<Country, "country_code" | "country_name">[];

  // Fetch linked upstream suppliers (RLS blocks the user-scoped join on suppliers table,
  // so we fetch link rows first, then resolve supplier details via admin client)
  const { data: rawLinks } = supplierId
    ? await (supabase.from("supplier_relationships") as any)
        .select("id, status, invite_email, accepted_at, notes, relationship_type, supplier_id")
        .eq("exporter_id", supplierId)
        .in("relationship_type", ["exporter_supplier", "self_supply"])
        .order("created_at", { ascending: false })
    : { data: [] };

  type RawLink = {
    id: string;
    status: string;
    invite_email: string | null;
    accepted_at: string | null;
    notes: string | null;
    relationship_type: string;
    supplier_id: string | null;
  };
  const rawLinkList = (rawLinks ?? []) as RawLink[];

  // Resolve supplier details using admin client (bypasses RLS on suppliers table)
  const linkedSupplierIds = [...new Set(rawLinkList.map((l) => l.supplier_id).filter(Boolean))] as string[];
  const supplierMap = new Map<string, { id: string; company_name: string; country: string; approval_status: string; supplier_type: string | null }>();
  if (linkedSupplierIds.length > 0) {
    const admin = createAdminSupabaseClient();
    const { data: supplierRows } = await (admin.from("suppliers") as any)
      .select("id, company_name, country, approval_status, supplier_type")
      .in("id", linkedSupplierIds);
    for (const s of (supplierRows ?? []) as Array<{ id: string; company_name: string; country: string; approval_status: string; supplier_type: string | null }>) {
      supplierMap.set(s.id, s);
    }
  }

  // For active links, fetch facility + product counts per supplier
  const activeSupplierIds = rawLinkList
    .filter((l) => l.status === "active" && l.supplier_id)
    .map((l) => l.supplier_id as string);

  const [facilitiesRes, productsRes, documentsRes] = activeSupplierIds.length > 0
    ? await Promise.all([
        (supabase.from("facilities_verify") as any)
          .select("id, supplier_id")
          .in("supplier_id", activeSupplierIds),
        (supabase.from("products_verify") as any)
          .select("id, supplier_id")
          .in("supplier_id", activeSupplierIds),
        (supabase.from("documents") as any)
          .select("id, supplier_id, evidence_status")
          .in("supplier_id", activeSupplierIds)
          .is("soft_deleted_at", null),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  // Build count maps
  const facilityCount  = new Map<string, number>();
  const productCount   = new Map<string, number>();
  const docCount       = new Map<string, number>();
  const acceptedCount  = new Map<string, number>();

  for (const f of (facilitiesRes.data ?? []) as Array<{ supplier_id: string }>) {
    facilityCount.set(f.supplier_id, (facilityCount.get(f.supplier_id) ?? 0) + 1);
  }
  for (const p of (productsRes.data ?? []) as Array<{ supplier_id: string }>) {
    productCount.set(p.supplier_id, (productCount.get(p.supplier_id) ?? 0) + 1);
  }
  for (const d of (documentsRes.data ?? []) as Array<{ supplier_id: string; evidence_status: string | null }>) {
    docCount.set(d.supplier_id, (docCount.get(d.supplier_id) ?? 0) + 1);
    if (d.evidence_status === "accepted") {
      acceptedCount.set(d.supplier_id, (acceptedCount.get(d.supplier_id) ?? 0) + 1);
    }
  }

  const linkedSuppliers = rawLinkList.map((link) => {
    const supplier = link.supplier_id ? supplierMap.get(link.supplier_id) ?? null : null;
    return {
      ...link,
      supplier,
      isSelfSupply: link.relationship_type === "self_supply",
      counts: supplier ? {
        facilities: facilityCount.get(supplier.id) ?? 0,
        products:   productCount.get(supplier.id) ?? 0,
        documents:  docCount.get(supplier.id) ?? 0,
        accepted:   acceptedCount.get(supplier.id) ?? 0,
      } : null,
    };
  });

  const supplierType = await getSupplierType(supabase as any, supplierId);

  return (
    <AppShell role={role} realRole={realRole} supplierType={supplierType}>
      <SectionHeader
        title="Upstream Vendors"
        description="Add and manage the manufacturers or processors that produce goods you export. Link them here, then add their facilities and products."
      />

      <div className="mt-6 space-y-6">
        <LinkedSuppliersPanel
          exporterId={supplierId}
          countries={countryOptions}
          linkedSuppliers={linkedSuppliers}
        />

        <LinkedExportersPanel
          supplierId={supplierId}
          supabase={supabase}
        />
      </div>
    </AppShell>
  );
}
