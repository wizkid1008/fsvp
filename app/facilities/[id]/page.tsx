import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { FacilityScoreCard } from "@/components/facilities/FacilityScoreCard";
import { RequiredEvidenceChecklist } from "@/components/evidence/RequiredEvidenceChecklist";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ChildList, DetailFacts, DetailSection } from "@/components/ui/DetailSection";
import { AddProductButton, FacilityEditButton } from "@/components/detail/DetailActions";
import type { FacilityRow } from "@/components/facilities/FacilityTable";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupplierType } from "@/lib/supplier-context";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { resolveApprovalStatuses } from "@/lib/scoring";
import { approvalLabel, approvalTone, NOT_ASSESSED } from "@/lib/approval/status";
import { ownOrUnclaimedProducts } from "@/lib/products/ownership";

export const runtime = "edge";

/**
 * One facility: where it sits (exporter › facility), its details with Edit,
 * the products made there with "+ Add product", and its documents — the same
 * layout as the exporter and product pages.
 */
export default async function FacilityDetailPage({ params }: { params: { id: string } }) {
  const { role, realRole, user } = await requireProfileRole(`/facilities/${params.id}`);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id, importer_id")
    .eq("id", user.id)
    .maybeSingle();
  const ownSupplierId: string | null =
    role === "supplier" ? resolvePreviewedAccountId(realRole, profile?.supplier_id ?? null) : null;
  const isSupplierView = role === "supplier" || role === "exporter";
  // The importer whose products this page lists — the previewed one for an
  // administrator, as on the other importer pages.
  const importerId: string | null = isSupplierView
    ? null
    : resolvePreviewedAccountId(realRole, profile?.importer_id ?? null);

  const { data: facility } = await (supabase.from("facilities_verify") as any)
    .select("id, facility_name, facility_type, facility_address_json, fda_registration_number, fda_registration_expires_on, production_capacity, manufacturing_processes, food_safety_certifications, supplier_id, suppliers(company_name)")
    .eq("id", params.id)
    .maybeSingle();

  if (!facility) notFound();

  let productsQuery = (supabase.from("products_verify") as any)
    .select("id, product_name, lifecycle")
    .eq("facility_id", params.id)
    .order("product_name");
  if (importerId) productsQuery = productsQuery.or(ownOrUnclaimedProducts(importerId));

  const [{ data: productRows }, { data: countryRows }, statuses] = await Promise.all([
    productsQuery,
    (supabase.from("countries") as any).select("country_code,country_name").eq("is_active", true).order("country_name"),
    resolveApprovalStatuses(supabase as any, "facility", [params.id]),
  ]);
  const products = (productRows ?? []) as Array<{ id: string; product_name: string; lifecycle: string | null }>;
  const countries = (countryRows ?? []) as Array<{ country_code: string; country_name: string }>;
  const approvalStatus = statuses.get(params.id) ?? NOT_ASSESSED;

  const address = (facility.facility_address_json ?? {}) as Record<string, string | undefined>;
  const location = [address.city, address.region ?? address.state, address.country].filter(Boolean).join(", ");
  const supplierRef = facility.supplier_id
    ? { id: facility.supplier_id as string, company_name: facility.suppliers?.company_name ?? "This exporter" }
    : null;

  return (
    <AppShell role={role} realRole={realRole} supplierType={await getSupplierType(supabase as any, ownSupplierId)}>
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <Link href="/facilities" className="hover:text-forest hover:underline">Facilities</Link>
        {supplierRef && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            {isSupplierView ? (
              <span>{supplierRef.company_name}</span>
            ) : (
              <Link href={`/exporters/${supplierRef.id}`} className="hover:text-forest hover:underline">
                {supplierRef.company_name}
              </Link>
            )}
          </>
        )}
      </nav>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <SectionHeader title={facility.facility_name} description="" />
        {/* The same status the Facilities list badges and counts — see
            lib/approval/status.ts. */}
        <StatusBadge tone={approvalTone(approvalStatus)}>{approvalLabel(approvalStatus)}</StatusBadge>
      </div>

      <div className="mt-6 space-y-6">
        <DetailSection
          title="Details"
          action={supplierRef && (
            <FacilityEditButton facility={facility as FacilityRow} supplier={supplierRef} countries={countries} />
          )}
        >
          <DetailFacts
            facts={[
              { label: "Exporter", value: supplierRef?.company_name ?? "Not set" },
              { label: "Type", value: <span className="capitalize">{(facility.facility_type ?? "—").replace(/_/g, " ")}</span> },
              { label: "Location", value: location || "Not recorded" },
              { label: "FDA registration", value: facility.fda_registration_number ?? "—" },
              {
                label: "Certifications",
                value: (facility.food_safety_certifications ?? []).length > 0
                  ? (facility.food_safety_certifications as string[]).join(", ")
                  : "None recorded",
              },
            ]}
          />
        </DetailSection>

        <DetailSection
          id="products"
          title={`Products (${products.length})`}
          action={supplierRef && (
            <AddProductButton
              supplier={supplierRef}
              countries={countries}
              presetFacilityId={facility.id}
              facilities={[{
                id: facility.id,
                facility_name: facility.facility_name,
                supplier_id: supplierRef.id,
                supplier_ids: [supplierRef.id],
                country: address.country ?? null,
              }]}
            />
          )}
        >
          {products.length > 0 && (
            <ChildList
              items={products.map((p) => ({
                href: `/products/${p.id}`,
                name: p.product_name,
                detail: p.lifecycle && p.lifecycle !== "active" ? p.lifecycle.replace(/_/g, " ") : undefined,
              }))}
            />
          )}
        </DetailSection>

        <DetailSection id="documents" title="Documents">
          <p className="-mt-2 mb-4 text-sm text-slate-500">
            The documents this facility needs. Upload next to any missing or returned item.
          </p>
          <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
            <FacilityScoreCard facilityId={params.id} supabase={supabase} />
            <div>
              <RequiredEvidenceChecklist
                linkType="facility"
                entityId={params.id}
                supplierId={facility.supplier_id}
                supabase={supabase}
                importerId={importerId}
              />
            </div>
          </div>
        </DetailSection>
      </div>
    </AppShell>
  );
}
