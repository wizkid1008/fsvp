import { FacilityTable, type FacilityRow } from "@/components/facilities/FacilityTable";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";
import { SupplierContextSwitcher } from "@/components/suppliers/SupplierContextSwitcher";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getSupplierType } from "@/lib/supplier-context";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import type { Country } from "@/types/database";

export const runtime = "edge";

export default async function FacilitiesPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const { role, realRole, user } = await requireProfileRole("/facilities");
  const supabase = createServerSupabaseClient();
  const isSupplier = role === "supplier" || role === "exporter";

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id")
    .eq("id", user.id)
    .maybeSingle();

  const ownSupplierId: string = isSupplier
    ? (resolvePreviewedAccountId(realRole, profile?.supplier_id ?? null) ?? "")
    : "";

  // Context switcher: exporter can view a linked supplier's facilities via ?view=<id>
  const viewId = searchParams.view ?? "";
  let activeSupplierId = ownSupplierId;
  let viewingLinkedSupplier: { id: string; company_name: string } | null = null;

  if (isSupplier && ownSupplierId && viewId && viewId !== ownSupplierId) {
    // Validate the requested view is actually a linked supplier
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

  // Fetch linked suppliers for context switcher dropdown (include pending so facilities can be added before invite is accepted)
  const { data: linkedSupplierRows } = isSupplier && ownSupplierId
    ? await (supabase.from("supplier_relationships") as any)
        .select("supplier_id")
        .eq("relationship_type", "exporter_supplier")
        .eq("exporter_id", ownSupplierId)
        .in("status", ["active", "pending_invite"])
    : { data: [] };

  const linkedSupplierIdList = ((linkedSupplierRows ?? []) as Array<{ supplier_id: string | null }>)
    .map((r) => r.supplier_id)
    .filter(Boolean) as string[];

  let linkedSuppliers: Array<{ id: string; company_name: string }> = [];
  if (linkedSupplierIdList.length > 0) {
    const admin = createAdminSupabaseClient();
    const { data: supplierRows } = await (admin.from("suppliers") as any)
      .select("id, company_name")
      .in("id", linkedSupplierIdList);
    linkedSuppliers = (supplierRows ?? []) as Array<{ id: string; company_name: string }>;
  }

  let suppliersQuery = (supabase.from("suppliers") as any)
    .select("id, company_name")
    .order("company_name");
  let accessQuery = (supabase.from("facility_supplier_access") as any)
    .select("facility_id, supplier_id")
    .order("created_at");

  if (isSupplier && activeSupplierId) {
    suppliersQuery = suppliersQuery.eq("id", activeSupplierId);
    accessQuery = accessQuery.eq("supplier_id", activeSupplierId);
  }

  const [{ data: rawFacilities }, { data: countries }, { data: suppliers }, { data: accessRows }, { data: documents }] = await Promise.all([
    (supabase.from("facilities_verify") as any)
      .select("id, facility_name, facility_type, facility_address_json, fda_registration_number, production_capacity, manufacturing_processes, food_safety_certifications, supplier_id, approval_status, suppliers(company_name)")
      .order("created_at", { ascending: false }),
    (supabase.from("countries") as any)
      .select("country_code,country_name")
      .eq("is_active", true)
      .order("country_name"),
    suppliersQuery,
    accessQuery,
    supabase.from("documents")
      .select("linked_entity_type, linked_entity_id"),
  ]);

  const evidenceCountByFacility = new Map<string, number>();
  for (const doc of (documents ?? []) as Array<{ linked_entity_type: string | null; linked_entity_id: string | null }>) {
    if (doc.linked_entity_type === "facility" && doc.linked_entity_id) {
      evidenceCountByFacility.set(doc.linked_entity_id, (evidenceCountByFacility.get(doc.linked_entity_id) ?? 0) + 1);
    }
  }

  let supplierOptions = (suppliers ?? []) as Array<{ id: string; company_name: string }>;

  // Guarantee the current supplier-role user's own record appears in the form options
  // even if the DB query returned empty (can happen when profiles.supplier_id isn't set
  // yet or RLS hasn't propagated). Without this, canAddFacility = false hides the button.
  if (isSupplier && ownSupplierId && !supplierOptions.some((s) => s.id === ownSupplierId)) {
    const { data: ownSupplier } = await (supabase.from("suppliers") as any)
      .select("id, company_name")
      .eq("id", ownSupplierId)
      .maybeSingle();
    if (ownSupplier) {
      supplierOptions = [ownSupplier, ...supplierOptions];
    }
  }

  const supplierById    = new Map(supplierOptions.map((s) => [s.id, s.company_name]));
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
        supplier_ids:   supplierIds,
        supplier_names: supplierIds.map((id) => supplierById.get(id)).filter(Boolean) as string[],
        evidence_count: evidenceCountByFacility.get(facility.id) ?? 0,
      };
    })
    .filter((facility) => !isSupplier || Boolean(activeSupplierId && facility.supplier_ids.includes(activeSupplierId)));

  const countryOptions = (countries ?? []) as Pick<Country, "country_code" | "country_name">[];

  const facilitiesAdded = facilities.length;
  const facilitiesApproved = facilities.filter((f) => f.approval_status === "approved").length;
  const facilitiesNeedingUpdates = facilities.filter((f) =>
    ["improvement_required", "not_approved", "suspended", "conditionally_approved"].includes(f.approval_status ?? "")
  ).length;

  const metricTone = (v: number, warnAbove = 0): StatusTone =>
    v === 0 ? "neutral" : v > warnAbove ? "warning" : "success";

  // For the FacilityTable form, include own company + all linked upstream suppliers
  const formSupplierOptions = viewingLinkedSupplier
    ? [viewingLinkedSupplier]
    : [
        ...supplierOptions,
        ...linkedSuppliers.filter((s) => !supplierOptions.some((o) => o.id === s.id)),
      ];

  return (
    <AppShell role={role} realRole={realRole} supplierType={await getSupplierType(supabase as any, ownSupplierId || null)}>
      <SectionHeader
        title={viewingLinkedSupplier
          ? `Facilities — ${viewingLinkedSupplier.company_name}`
          : "Facilities"}
        description="Manage manufacturing facilities, FDA registrations, processes, certifications, and production capacity."
      />

      {/* Context switcher — only shown when the exporter has linked suppliers */}
      {isSupplier && linkedSuppliers.length > 0 && (
        <SupplierContextSwitcher
          ownId={ownSupplierId}
          ownLabel={profile?.organization_name ?? "My Facilities"}
          linkedSuppliers={linkedSuppliers}
          currentViewId={activeSupplierId}
          basePath="/facilities"
        />
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Facilities Added", value: facilitiesAdded, tone: "info" as StatusTone },
          { label: "Facilities Approved", value: facilitiesApproved, tone: "success" as StatusTone },
          { label: "Facilities Needing Updates", value: facilitiesNeedingUpdates, tone: metricTone(facilitiesNeedingUpdates, 0) },
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
        <FacilityTable
          countries={countryOptions}
          facilities={facilities}
          supplierHref={isSupplier ? "/my-suppliers" : "/suppliers"}
          suppliers={formSupplierOptions}
        />
      </div>
    </AppShell>
  );
}
