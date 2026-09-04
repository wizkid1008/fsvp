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
    .select("id, company_name, legal_entity_name, country, supplier_type, fda_registration_number, contact_json")
    .eq("id", params.id)
    .maybeSingle();

  if (!exporter) notFound();

  // Facilities by ownership; products scoped to the viewing tenant, since a
  // product record belongs to one importer and another buyer's count is none of
  // this reader's business.
  let productsQuery = (admin.from("products_verify") as any)
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", params.id);
  if (scoped && importerId) productsQuery = productsQuery.eq("importer_id", importerId);

  const [{ count: facilityCount }, { count: productCount }] = await Promise.all([
    (admin.from("facilities_verify") as any)
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", params.id),
    productsQuery,
  ]);

  const facts: Array<{ label: string; value: string }> = [
    { label: "Country", value: exporter.country ?? "Not recorded" },
    { label: "FDA registration", value: exporter.fda_registration_number ?? "—" },
    { label: "Type", value: (exporter.supplier_type ?? "exporter").replace(/_/g, " ") },
    { label: "Facilities", value: String(facilityCount ?? 0) },
    { label: "Products", value: String(productCount ?? 0) },
  ];

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title={exporter.company_name}
        description={exporter.legal_entity_name ?? "Exporter detail"}
      />

      <div className="mt-2 flex items-center gap-2">
        <Link href="/exporters" className="text-sm text-forest hover:underline">
          ← Back to all exporters
        </Link>
      </div>

      <dl className="mt-6 grid gap-3 rounded-lg border border-line bg-white p-5 text-sm shadow-soft sm:grid-cols-3 lg:grid-cols-5">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{fact.label}</dt>
            <dd className="mt-1 font-medium capitalize text-ink">{fact.value}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-6 rounded-lg border border-line bg-white p-5 shadow-soft">
        <h2 className="text-base font-semibold text-ink">Required company documents</h2>
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
    </AppShell>
  );
}
