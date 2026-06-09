import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { CorporateScoreCard } from "@/components/corporate/CorporateScoreCard";
import { CorporateScopeList } from "@/components/corporate/CorporateScopeList";
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

  let supplierId: string | null = profile?.supplier_id ?? null;

  // If supplier_id is not set on the profile, resolve it in three steps:
  // 1. Look for an existing suppliers row matching the org name
  // 2. If none found, create one from the profile data and link it
  if (!supplierId) {
    const orgName = profile?.organization_name ?? profile?.full_name ?? null;

    // Step 1 — match by company name
    if (orgName) {
      const { data: matchedSupplier } = await (supabase.from("suppliers") as any)
        .select("id")
        .ilike("company_name", orgName)
        .maybeSingle();
      supplierId = matchedSupplier?.id ?? null;
    }

    // Step 2 — create a new suppliers row if still no match
    if (!supplierId) {
      const { data: newSupplier } = await (supabase.from("suppliers") as any)
        .insert({
          company_name:          profile?.organization_name ?? profile?.full_name ?? "Unnamed Exporter",
          legal_entity_name:     profile?.organization_name ?? null,
          country:               profile?.country ?? null,
          primary_contact_name:  profile?.full_name ?? null,
          status:                "pending",
        })
        .select("id")
        .maybeSingle();
      supplierId = newSupplier?.id ?? null;
    }

    // Step 3 — write the resolved id back to the profile so this only runs once
    if (supplierId) {
      await (supabase.from("profiles") as any)
        .update({ supplier_id: supplierId })
        .eq("id", user.id);
    }
  }

  const { data: supplier } = supplierId
    ? await (supabase.from("suppliers") as any)
        .select("company_name, legal_entity_name, country, fda_registration_number, primary_contact_name, primary_contact_email, status")
        .eq("id", supplierId)
        .maybeSingle()
    : { data: null };

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Corporate"
        description="Manage exporter-level records, policies, contacts, attestations, and supplier-wide readiness requirements."
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* ── Left column ─────────────────────────────────────── */}
        <div className="flex flex-col gap-6">

          {/* 1. Readiness Score */}
          <CorporateScoreCard supplierId={supplierId} supabase={supabase} />

          {/* 2. Exporter Profile */}
          <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Exporter Profile
                </p>
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
                <dd className="mt-1 text-ink">
                  {supplier?.country || profile?.country || "Not recorded"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">FDA registration</dt>
                <dd className="mt-1 text-ink">
                  {supplier?.fda_registration_number || "Not recorded"}
                </dd>
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

            <Link
              href="/account"
              className="mt-5 inline-flex h-9 items-center rounded-md border border-line px-3 text-sm font-semibold text-slate-600 transition hover:border-forest hover:text-forest"
            >
              Edit account profile
            </Link>
          </section>
        </div>

        {/* ── Right column — Requirements + inline upload ──────── */}
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h2 className="text-base font-semibold text-ink">Corporate Readiness Requirements</h2>
          <p className="mt-1 text-sm text-slate-500">
            Click any section to upload evidence or view progress.
            Accepted documents count toward your readiness score.
          </p>
          <CorporateScopeList supplierId={supplierId} supabase={supabase} />
        </section>
      </div>
    </AppShell>
  );
}
