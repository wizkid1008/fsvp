import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequiredEvidenceChecklist } from "@/components/evidence/RequiredEvidenceChecklist";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ConfigurationNotice } from "@/components/ui/ConfigurationNotice";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { isTenantConfined } from "@/lib/auth/tenancy";
import { ownOrUnclaimedProducts } from "@/lib/products/ownership";
import { ChildList, DetailFacts, DetailSection } from "@/components/ui/DetailSection";
import { AddFacilityButton, AddProductButton, ExporterEditButton } from "@/components/detail/DetailActions";

export const runtime = "edge";

/**
 * One exporter, and what it still owes.
 *
 * The exporter was the only FSVP entity level with no detail page. Facilities
 * and products each have one that renders RequiredEvidenceChecklist, so the
 * reader can see what is outstanding; the exporter's Evidence cell went to the
 * document library instead, which can only show what HAS been uploaded and
 * never what is missing. The company-level requirement set is the largest of
 * the three — twelve items, six of them critical blockers, including the
 * § 1.506(e)(2) written assurances — so it was the one level where "what do I
 * still need?" had no answer anywhere in the app.
 */
export default async function ExporterDetailPage({ params }: { params: { id: string } }) {
  const { role, realRole, user } = await requireProfileRole(`/exporters/${params.id}`);
  const supabase = createServerSupabaseClient();

  const adminResult = tryAdminClient();
  if (!adminResult.ok) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader title="Exporter" description="" />
        <ConfigurationNotice message={adminResult.message} />
      </AppShell>
    );
  }
  const admin = adminResult.client;

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const importerId: string | null = resolvePreviewedAccountId(realRole, profile?.importer_id ?? null);

  // Read through the admin client, exactly as /exporters does, so RLS does not
  // scope this and tenancy is applied by hand. Without the link check below any
  // importer could read any exporter on the platform by typing its id into the
  // URL — the list page filters to linked exporters, and a detail page that did
  // not would simply route around that filter.
  const scoped =
    role === "us_importer" ||
    isTenantConfined({ role: realRole, importer_id: profile?.importer_id ?? null });

  if (scoped) {
    if (!importerId) notFound();

    const { data: link } = await (admin.from("supplier_relationships") as any)
      .select("id")
      .eq("relationship_type", "importer_supplier")
      .eq("importer_id", importerId)
      .eq("supplier_id", params.id)
      .in("status", ["active", "pending_invite"])
      .maybeSingle();

    // notFound rather than a forbidden page: whether this tenant is linked to a
    // given exporter is itself information, and a 403 would confirm the
    // exporter exists.
    if (!link) notFound();
  }

  const { data: exporter } = await (admin.from("suppliers") as any)
    .select("id, company_name, legal_entity_name, country, website, supplier_type, fda_registration_number, duns_number, contact_json, record_mode, managed_by_importer_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!exporter) notFound();

  // Facilities by ownership; products scoped to the viewing tenant, since a
  // product record belongs to one importer and another buyer's is none of this
  // reader's business.
  let productsQuery = (admin.from("products_verify") as any)
    .select("id, product_name, facility_id, facilities_verify(facility_name)")
    .eq("supplier_id", params.id)
    .order("product_name");
  if (scoped && importerId) productsQuery = productsQuery.or(ownOrUnclaimedProducts(importerId));

  const [{ data: facilityRows }, { data: productRows }, { data: countryRows }] = await Promise.all([
    (admin.from("facilities_verify") as any)
      .select("id, facility_name, facility_type, facility_address_json")
      .eq("supplier_id", params.id)
      .order("facility_name"),
    productsQuery,
    (admin.from("countries") as any).select("country_code,country_name").eq("is_active", true).order("country_name"),
  ]);
  const facilities = (facilityRows ?? []) as Array<{
    id: string; facility_name: string; facility_type: string | null; facility_address_json: { country?: string } | null;
  }>;
  const products = (productRows ?? []) as Array<{
    id: string; product_name: string; facility_id: string | null; facilities_verify: { facility_name: string } | null;
  }>;
  const countries = (countryRows ?? []) as Array<{ country_code: string; country_name: string }>;
  const supplierRef = { id: exporter.id as string, company_name: exporter.company_name as string };

  // The Exporters list's edit rule: an importer edits only a record it manages
  // and the exporter has not claimed; platform staff edit any.
  const asImporter = scoped;
  const editBlockedReason = !asImporter
    ? null
    : exporter.record_mode === "self_managed"
      ? `${exporter.company_name} maintains their own record`
      : exporter.managed_by_importer_id !== importerId
        ? "Only the importer that created this record can edit it"
        : null;

  return (
    <AppShell role={role} realRole={realRole}>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-slate-500">
        <Link href="/exporters" className="hover:text-forest hover:underline">Exporters</Link>
      </nav>
      <SectionHeader
        title={exporter.company_name}
        description={exporter.legal_entity_name ?? ""}
      />

      <div className="mt-6 space-y-6">
        <DetailSection
          title="Details"
          action={
            <ExporterEditButton
              exporter={exporter}
              countries={countries}
              asImporter={asImporter}
              blockedReason={editBlockedReason}
            />
          }
        >
          <DetailFacts
            facts={[
              { label: "Country", value: exporter.country ?? "Not recorded" },
              { label: "Type", value: <span className="capitalize">{(exporter.supplier_type ?? "exporter").replace(/_/g, " ")}</span> },
              { label: "FDA registration", value: exporter.fda_registration_number ?? "—" },
              { label: "Email", value: exporter.contact_json?.email ?? "—" },
              { label: "Website", value: exporter.website ?? "—" },
            ]}
          />
        </DetailSection>

        <DetailSection
          title={`Facilities (${facilities.length})`}
          done={facilities.length > 0}
          hint="add the site this exporter produces at"
          action={<AddFacilityButton supplier={supplierRef} countries={countries} />}
        >
          {facilities.length > 0 && (
            <ChildList
              items={facilities.map((f) => ({
                href: `/facilities/${f.id}`,
                name: f.facility_name,
                detail: [
                  f.facility_type ? f.facility_type.charAt(0).toUpperCase() + f.facility_type.slice(1).replace(/_/g, " ") : null,
                  f.facility_address_json?.country,
                ].filter(Boolean).join(" · "),
              }))}
            />
          )}
        </DetailSection>

        <DetailSection
          title={`Products (${products.length})`}
          action={
            <AddProductButton
              supplier={supplierRef}
              countries={countries}
              facilities={facilities.map((f) => ({
                id: f.id,
                facility_name: f.facility_name,
                supplier_id: exporter.id,
                supplier_ids: [exporter.id],
                country: f.facility_address_json?.country ?? null,
              }))}
            />
          }
        >
          {products.length > 0 && (
            <ChildList
              items={products.map((p) => ({
                href: `/products/${p.id}`,
                name: p.product_name,
                detail: p.facilities_verify?.facility_name ?? "No facility yet",
              }))}
            />
          )}
        </DetailSection>

      <section id="documents" className="scroll-mt-24 rounded-lg border border-line bg-white p-5 shadow-soft">
        <h2 className="text-base font-semibold text-ink">Documents</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          What this exporter owes at company level, separately from any one facility or
          product. Most of it describes the company itself and is shared with every
          importer it supplies; written assurances and the importer acknowledgement are
          agreements with <span className="font-medium text-slate-700">you specifically</span>,
          and only a document filed for your organization satisfies them.
        </p>
        {/* importerId is what makes that last sentence true rather than
            decorative: it is what the scope rules match relationship items
            against. See lib/readiness/evidence-scope.ts. */}
        <RequiredEvidenceChecklist
          linkType="supplier"
          entityId={params.id}
          supplierId={params.id}
          supabase={supabase}
          importerId={importerId}
        />
      </section>
      </div>
    </AppShell>
  );
}
