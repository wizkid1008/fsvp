import { NextStepBanner } from "@/components/ui/NextStepBanner";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SupplierTable, type SupplierRow } from "@/components/suppliers/SupplierTable";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import { ConfigurationNotice } from "@/components/ui/ConfigurationNotice";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { isTenantConfined } from "@/lib/auth/tenancy";
import type { Country } from "@/types/database";

export const runtime = "edge";

export default async function ExportersPage() {
  const { role, realRole, user } = await requireProfileRole("/exporters");
  const supabase = createServerSupabaseClient();

  const adminResult = tryAdminClient();
  if (!adminResult.ok) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader title="Exporters" description="" />
        <ConfigurationNotice message={adminResult.message} />
      </AppShell>
    );
  }
  const admin = adminResult.client;

  // Get the importer's own ID so we can scope to their linked suppliers
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const importerId: string | null = resolvePreviewedAccountId(realRole, profile?.importer_id ?? null);

  // This page reads through the admin client, so RLS does not scope it and the
  // tenancy rule must be applied here. A reviewer holding an importer_id is one
  // tenant's qualified individual, not a platform-wide reviewer
  // (004_reviewer_tenancy.sql) — without this they would see every supplier on
  // the platform. `role` rather than `realRole` for the importer branch keeps
  // admin role-preview working.
  const scoped =
    role === "us_importer" ||
    isTenantConfined({ role: realRole, importer_id: profile?.importer_id ?? null });

  // Resolve which supplier IDs this tenant is linked to
  let linkedSupplierIds: string[] | null = null;
  if (scoped && importerId) {
    const { data: links } = await (admin.from("supplier_relationships") as any)
      .select("supplier_id")
      .eq("relationship_type", "importer_supplier")
      .eq("importer_id", importerId)
      .in("status", ["active", "pending_invite"]);

    linkedSupplierIds = ((links ?? []) as Array<{ supplier_id: string }>)
      .map((l) => l.supplier_id)
      .filter(Boolean);
  }

  // Suspension is per importer, not per supplier — see migration 010. A
  // platform-wide viewer sees none, because there is no tenant to be suspended
  // in relation to.
  const { data: rawSuspensions } = importerId
    ? await (admin.from("supplier_suspensions") as any)
        .select("id, supplier_id, basis, reason, suspended_at")
        .eq("importer_id", importerId)
        .is("lifted_at", null)
    : { data: [] };

  const suspensions = (rawSuspensions ?? []) as Array<{
    id: string; supplier_id: string; basis: string; reason: string; suspended_at: string;
  }>;

  let suppliersQuery = (admin.from("suppliers") as any)
    .select("id, company_name, legal_entity_name, country, website, approval_status, certification_status, fda_registration_number, contact_json, supplier_type, updated_at, record_mode, managed_by_importer_id, duns_number")
    .order("updated_at", { ascending: false });

  if (scoped) {
    // A tenant's own list is about who it buys from, so it stays limited to
    // export-eligible types and to the exporters actually linked to it.
    suppliersQuery = suppliersQuery.in("supplier_type", ["exporter", "exporter_manufacturer", "trader"]);

    if (linkedSupplierIds && linkedSupplierIds.length > 0) {
      suppliersQuery = suppliersQuery.in("id", linkedSupplierIds);
    } else {
      // No linked exporters — return empty list, not the whole DB
      suppliersQuery = suppliersQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    }
  }
  // ONLY administrators and platform reviewers (no importer_id) fall through to
  // the unscoped query, and they get every supplier_type — exporters,
  // manufacturers, traders and brokers alike. The export-eligible filter used
  // to run for everyone, so `manufacturer` and `broker` rows were unreachable
  // from any screen in the app, even by URL.

  // The Status column used to show suppliers.approval_status, which nothing in
  // the app ever advances — every exporter created through the UI is written
  // 'pending_review' at insert and stays there forever, while seeded rows read
  // "Approved". In an FSVP tool a column headed Status reading Pending Review
  // implies the § 1.505 supplier determination, which lives on fsvp_records and
  // is made per product. So the column now reports the real thing.
  let recordsQuery = (admin.from("fsvp_records") as any)
    .select("id, status, supplier_id");
  if (scoped && importerId) {
    recordsQuery = recordsQuery.eq("importer_id", importerId);
  }

  // Everything below reads through the admin client, so RLS does not scope it
  // and tenancy has to be applied by hand — the same rule the supplier query
  // above already follows.
  //
  // A product record belongs to exactly one importer, so counting them is a
  // strict match. Documents are not: an exporter serving several importers
  // uploads its corporate evidence with importer_id null on purpose (see
  // app/api/documents/upload/route.ts), and that evidence genuinely belongs to
  // every importer who reads it. So the document filter is "mine, or nobody's
  // in particular" — anything else either undercounts the exporter's own
  // policies or, as before this change, counted another importer's uploads.
  let productsQuery = (admin.from("products_verify") as any).select("id, supplier_id");
  let documentsQuery = (admin.from("documents") as any)
    .select("linked_entity_type, linked_entity_id");

  if (scoped && importerId) {
    productsQuery = productsQuery.eq("importer_id", importerId);
    documentsQuery = documentsQuery.or(`importer_id.eq.${importerId},importer_id.is.null`);
  }

  const [{ data: rawSuppliers }, { data: countries }, { data: products }, { data: facilities }, { data: facilityAccess }, { data: documents }, { data: rawRecords }] = await Promise.all([
    suppliersQuery,
    (admin.from("countries") as any)
      .select("country_code,country_name")
      .eq("is_active", true)
      .order("country_name"),
    productsQuery,
    (admin.from("facilities_verify") as any).select("id, supplier_id"),
    (admin.from("facility_supplier_access") as any).select("facility_id, supplier_id"),
    documentsQuery,
    recordsQuery,
  ]);

  // Grouped into the three answers an importer actually wants from this table:
  // how many products from this exporter are cleared, how many are still being
  // worked, and how many are blocked. Statuses come from fsvp_records.status.
  const BLOCKED = new Set(["needs_corrective_action", "rejected", "expired"]);
  const APPROVED = new Set(["importer_approved", "conditionally_approved"]);

  const recordSummary: Record<string, { approved: number; open: number; blocked: number }> = {};
  for (const row of (rawRecords ?? []) as Array<{ status: string; supplier_id: string | null }>) {
    if (!row.supplier_id) continue;
    const entry = recordSummary[row.supplier_id] ?? { approved: 0, open: 0, blocked: 0 };
    if (BLOCKED.has(row.status)) entry.blocked += 1;
    else if (APPROVED.has(row.status)) entry.approved += 1;
    else entry.open += 1;
    recordSummary[row.supplier_id] = entry;
  }

  const productSupplier = new Map(
    ((products ?? []) as Array<{ id: string; supplier_id: string | null }>).map((p) => [p.id, p.supplier_id])
  );
  const facilitySuppliers = new Map<string, string[]>();
  for (const facility of (facilities ?? []) as Array<{ id: string; supplier_id: string | null }>) {
    if (facility.supplier_id) facilitySuppliers.set(facility.id, [facility.supplier_id]);
  }
  for (const access of (facilityAccess ?? []) as Array<{ facility_id: string; supplier_id: string }>) {
    const existing = facilitySuppliers.get(access.facility_id) ?? [];
    if (!existing.includes(access.supplier_id)) existing.push(access.supplier_id);
    facilitySuppliers.set(access.facility_id, existing);
  }

  const evidenceCountBySupplier = new Map<string, number>();
  for (const doc of (documents ?? []) as Array<{ linked_entity_type: string | null; linked_entity_id: string | null }>) {
    if (!doc.linked_entity_id) continue;
    let supplierId: string | null | undefined = null;
    if (doc.linked_entity_type === "supplier" || doc.linked_entity_type === "foreign_supplier") {
      supplierId = doc.linked_entity_id;
    } else if (doc.linked_entity_type === "product") {
      supplierId = productSupplier.get(doc.linked_entity_id);
    } else if (doc.linked_entity_type === "facility") {
      for (const id of facilitySuppliers.get(doc.linked_entity_id) ?? []) {
        evidenceCountBySupplier.set(id, (evidenceCountBySupplier.get(id) ?? 0) + 1);
      }
      continue;
    }
    if (supplierId) {
      evidenceCountBySupplier.set(supplierId, (evidenceCountBySupplier.get(supplierId) ?? 0) + 1);
    }
  }

  // Counted from the rows already fetched above, so this costs no extra query.
  //
  // Facilities are counted by OWNERSHIP only. facility_supplier_access grants a
  // second exporter working access to somebody else's site, and folding those in
  // would tell an importer this exporter has four facilities when it operates
  // one — a different fact from the one the column claims to report.
  const facilityCountBySupplier = new Map<string, number>();
  for (const facility of (facilities ?? []) as Array<{ supplier_id: string | null }>) {
    if (!facility.supplier_id) continue;
    facilityCountBySupplier.set(
      facility.supplier_id,
      (facilityCountBySupplier.get(facility.supplier_id) ?? 0) + 1
    );
  }

  const productCountBySupplier = new Map<string, number>();
  for (const product of (products ?? []) as Array<{ supplier_id: string | null }>) {
    if (!product.supplier_id) continue;
    productCountBySupplier.set(
      product.supplier_id,
      (productCountBySupplier.get(product.supplier_id) ?? 0) + 1
    );
  }

  const suppliers = ((rawSuppliers ?? []) as SupplierRow[]).map((s) => ({
    ...s,
    evidence_count: evidenceCountBySupplier.get(s.id) ?? 0,
    facility_count: facilityCountBySupplier.get(s.id) ?? 0,
    product_count: productCountBySupplier.get(s.id) ?? 0,
  }));

  const countryOptions = (countries ?? []) as Pick<Country, "country_code" | "country_name">[];

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title={scoped ? "My Exporters" : "All Suppliers & Exporters"}
        description={scoped
          ? "Exporters you import from. Link one who already has an account, or create a record yourself for an exporter who will not register."
          : "Every registered foreign company across all tenants — exporters, manufacturers, traders and brokers. The badge under each name is its supplier type."}
      />
      {/* Adding an exporter used to end here, with nothing saying what it was
          for. The row's own actions are Suspend and Edit — both about the
          exporter, neither about the journey it belongs to. */}
      {scoped && suppliers.length > 0 && (
        <NextStepBanner>
          a facility belongs to one exporter, so add it from that exporter&apos;s row — use{" "}
          <span className="font-semibold text-ink">Add facility</span> in the Facilities column.
          Every exporter needs at least one before you can add the products you import from it.
        </NextStepBanner>
      )}

      <SupplierTable
        countries={countryOptions}
        suppliers={suppliers}
        importerId={role === "us_importer" ? (importerId ?? undefined) : undefined}
        suspensions={suspensions}
        recordSummary={recordSummary}
        scoped={scoped}
      />
    </AppShell>
  );
}
