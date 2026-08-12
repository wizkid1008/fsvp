import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfigurationNotice } from "@/components/ui/ConfigurationNotice";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

type ProductRow = {
  id: string;
  product_name: string;
  country_of_origin: string | null;
  commodity_id: string | null;
  supplier_id: string | null;
  suppliers: { company_name: string } | null;
  facilities_verify: { facility_name: string } | null;
};

function readinessTone(blockers: string[], prohibited: boolean): StatusTone {
  if (prohibited) return "danger";
  if (blockers.length > 0) return "warning";
  return "success";
}

function readinessLabel(blockers: string[], prohibited: boolean) {
  if (prohibited) return "Do not ship";
  if (blockers.length > 0) return "Action needed";
  return "Ready";
}

export default async function ShipmentReadinessPage() {
  const { role, realRole, user } = await requireProfileRole("/shipment-readiness", [
    "us_importer",
    "administrator",
  ]);
  const supabase = createServerSupabaseClient();

  const adminResult = tryAdminClient();
  if (!adminResult.ok) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader title="Shipment Readiness" description="" />
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

  if (!importerId) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader
          title="Shipment Readiness"
          description="Daily operating view for whether supplier/product combinations are ready to move."
        />
        <div className="mt-6 rounded-lg border border-line bg-white px-6 py-10 text-center text-sm text-slate-600">
          Your account is not linked to an importing organization yet.
        </div>
      </AppShell>
    );
  }

  const { data: links } = await (admin.from("supplier_relationships") as any)
    .select("supplier_id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", importerId)
    .in("status", ["active", "pending_invite"]);

  const supplierIds = ((links ?? []) as Array<{ supplier_id: string | null }>)
    .map((link) => link.supplier_id)
    .filter((id): id is string => Boolean(id));

  const { data: rawProducts } = supplierIds.length
    ? await (admin.from("products_verify") as any)
        .select("id, product_name, country_of_origin, commodity_id, supplier_id, suppliers(company_name), facilities_verify(facility_name)")
        .in("supplier_id", supplierIds)
        .order("product_name")
    : { data: [] };

  const products = (rawProducts ?? []) as ProductRow[];
  const productIds = products.map((product) => product.id);

  const [
    { data: rawRecords },
    { data: rawAdmissibility },
    { data: rawApplicability },
    { data: rawScreenings },
    { data: rawDocuments },
  ] = await Promise.all([
    productIds.length
      ? (admin.from("fsvp_records") as any)
          .select("id, status, supplier_id, product_id, reassessment_due_at")
          .eq("importer_id", importerId)
          .in("product_id", productIds)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? (admin.from("admissibility_determinations_status") as any)
          .select("product_id, outcome, is_current, expires_at")
          .in("product_id", productIds)
          .is("superseded_at", null)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? (admin.from("fsvp_applicability_determinations") as any)
          .select("product_id, outcome, expires_at")
          .eq("importer_id", importerId)
          .in("product_id", productIds)
          .is("superseded_at", null)
      : Promise.resolve({ data: [] }),
    supplierIds.length
      ? (admin.from("supplier_compliance_screenings") as any)
          .select("supplier_id, conclusion, expires_at")
          .eq("importer_id", importerId)
          .in("supplier_id", supplierIds)
          .is("superseded_at", null)
      : Promise.resolve({ data: [] }),
    supplierIds.length
      ? (admin.from("documents") as any)
          .select("supplier_id, expiration_date")
          .in("supplier_id", supplierIds)
          .eq("evidence_status", "accepted")
          .is("soft_deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const recordsByProduct = new Map(
    ((rawRecords ?? []) as Array<{ id: string; product_id: string; status: string; reassessment_due_at: string | null }>)
      .map((record) => [record.product_id, record])
  );
  const admissibilityByProduct = new Map(
    ((rawAdmissibility ?? []) as Array<{ product_id: string; outcome: string; is_current: boolean; expires_at: string | null }>)
      .filter((row) => row.is_current)
      .map((row) => [row.product_id, row])
  );
  const applicabilityByProduct = new Map(
    ((rawApplicability ?? []) as Array<{ product_id: string; outcome: string; expires_at: string | null }>)
      .filter((row) => !row.expires_at || row.expires_at >= today)
      .map((row) => [row.product_id, row])
  );
  const screeningBySupplier = new Map(
    ((rawScreenings ?? []) as Array<{ supplier_id: string; conclusion: string; expires_at: string | null }>)
      .filter((row) => !row.expires_at || row.expires_at >= today)
      .map((row) => [row.supplier_id, row])
  );
  const expiringDocsBySupplier = new Map<string, number>();
  for (const doc of (rawDocuments ?? []) as Array<{ supplier_id: string | null; expiration_date: string | null }>) {
    if (!doc.supplier_id || !doc.expiration_date) continue;
    const days = Math.ceil((new Date(doc.expiration_date).getTime() - Date.now()) / 86400000);
    if (days <= 60) expiringDocsBySupplier.set(doc.supplier_id, (expiringDocsBySupplier.get(doc.supplier_id) ?? 0) + 1);
  }

  const rows = products.map((product) => {
    const blockers: string[] = [];
    const record = recordsByProduct.get(product.id);
    const admissibility = admissibilityByProduct.get(product.id);
    const applicability = applicabilityByProduct.get(product.id);
    const screening = product.supplier_id ? screeningBySupplier.get(product.supplier_id) : null;
    const expiringDocs = product.supplier_id ? expiringDocsBySupplier.get(product.supplier_id) ?? 0 : 0;

    if (!product.commodity_id) blockers.push("Classify commodity");
    if (!product.country_of_origin) blockers.push("Record origin");
    if (!admissibility) blockers.push("Determine admissibility");
    if (!applicability) blockers.push("Determine FSVP applicability");
    if (!record) blockers.push("Create FSVP record");
    if (record && !["importer_approved", "conditionally_approved"].includes(record.status)) blockers.push("Approve FSVP record");
    if (record?.reassessment_due_at && record.reassessment_due_at < today) blockers.push("Reassess record");
    if (!screening) blockers.push("Screen compliance history");
    if (screening?.conclusion === "adverse_history_blocking") blockers.push("Resolve blocking FDA history");
    if (expiringDocs > 0) blockers.push(`${expiringDocs} evidence document${expiringDocs === 1 ? "" : "s"} expiring`);

    return {
      product,
      record,
      admissibility,
      blockers,
      prohibited: admissibility?.outcome === "prohibited",
    };
  });

  const ready = rows.filter((row) => row.blockers.length === 0 && !row.prohibited).length;

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Shipment Readiness"
        description="Daily operating view for whether supplier/product combinations are ready to move through the FSVP journey."
        actionSlot={
          <Link
            href="/setup/fsvp"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
          >
            <PackageCheck className="h-4 w-4" />
            Guided setup
          </Link>
        }
      />

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Ready", value: ready, tone: "success" as StatusTone },
          { label: "Action Needed", value: rows.filter((row) => row.blockers.length > 0 && !row.prohibited).length, tone: "warning" as StatusTone },
          { label: "Do Not Ship", value: rows.filter((row) => row.prohibited).length, tone: "danger" as StatusTone },
        ].map((metric) => (
          <article key={metric.label} className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <p className="text-sm font-semibold text-slate-600">{metric.label}</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{metric.value}</p>
            <StatusBadge tone={metric.tone} className="mt-2">Products</StatusBadge>
          </article>
        ))}
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            No linked supplier products yet. Add exporters, facilities, and products before checking shipments.
          </div>
        ) : (
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-line bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Supplier / Facility</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Next Action</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => {
                const tone = readinessTone(row.blockers, row.prohibited);
                return (
                  <tr key={row.product.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{row.product.product_name}</p>
                      <p className="text-xs text-slate-500">{row.product.country_of_origin ?? "Origin missing"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p>{row.product.suppliers?.company_name ?? "Supplier"}</p>
                      <p className="text-xs text-slate-400">{row.product.facilities_verify?.facility_name ?? "Facility not linked"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={tone}>{readinessLabel(row.blockers, row.prohibited)}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.blockers.length === 0 ? "No blockers found" : row.blockers.slice(0, 3).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/products/${row.product.id}`} className="text-xs font-semibold text-forest hover:underline">
                        Open
                      </Link>
                      {row.record && (
                        <Link href={`/fsvp-records/${row.record.id}`} className="ml-3 text-xs font-semibold text-forest hover:underline">
                          FSVP
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  );
}
