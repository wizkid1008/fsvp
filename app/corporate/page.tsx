import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { SectionReadinessList } from "@/components/readiness/SectionReadinessList";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "edge";

export default async function CorporatePage() {
  const { role, user } = await requireProfileRole("/corporate", ["supplier", "administrator"]);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id, full_name, organization_name, country")
    .eq("id", user.id)
    .maybeSingle();

  const supplierId = profile?.supplier_id ?? null;
  const { data: supplier } = supplierId
    ? await (supabase.from("suppliers") as any)
        .select("company_name, legal_entity_name, country, fda_registration_number, primary_contact_name, primary_contact_email, status")
        .eq("id", supplierId)
        .maybeSingle()
    : { data: null };

  const corporateItems = [
    "Legal entity and ownership",
    "Primary contacts",
    "Supplier questionnaire",
    "Corporate food safety policy",
    "Recall and traceability programs",
    "Importer relationship and written assurances"
  ];

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Corporate"
        description="Manage exporter-level records, policies, contacts, attestations, and supplier-wide readiness requirements."
        action={{ label: "Upload corporate evidence", href: "/my-evidence" }}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Exporter Profile</p>
              <h2 className="mt-2 text-xl font-semibold text-ink">
                {supplier?.company_name ?? profile?.organization_name ?? "Corporate profile"}
              </h2>
            </div>
            <StatusBadge tone={supplier?.status === "approved" ? "success" : "warning"}>
              {supplier?.status ?? "pending"}
            </StatusBadge>
          </div>

          <dl className="mt-5 space-y-3 text-sm">
            <div>
              <dt className="font-semibold text-slate-500">Legal entity</dt>
              <dd className="mt-1 text-ink">{supplier?.legal_entity_name || "Not recorded"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Country</dt>
              <dd className="mt-1 text-ink">{supplier?.country || profile?.country || "Not recorded"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">FDA registration</dt>
              <dd className="mt-1 text-ink">{supplier?.fda_registration_number || "Not recorded"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Primary contact</dt>
              <dd className="mt-1 text-ink">
                {supplier?.primary_contact_name || profile?.full_name || "Not recorded"}
                {supplier?.primary_contact_email ? (
                  <span className="block text-slate-500">{supplier.primary_contact_email}</span>
                ) : null}
              </dd>
            </div>
          </dl>

          <Link href="/account" className="mt-5 inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-semibold text-slate-600 transition hover:border-forest hover:text-forest">
            Edit account profile
          </Link>
        </section>

        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h2 className="text-base font-semibold text-ink">Corporate Readiness Scope</h2>
          <p className="mt-1 text-sm text-slate-500">
            These are supplier-wide records and policies. Facility and product evidence belongs on those pages.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {corporateItems.map((item) => (
              <div key={item} className="rounded-md border border-line bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6">
        <SectionReadinessList
          appliesTo="supplier"
          emptyText="Corporate readiness requirements are not configured yet."
          supplierId={supplierId}
          supabase={supabase}
          title="Corporate Readiness Requirements"
        />
      </div>
    </AppShell>
  );
}
