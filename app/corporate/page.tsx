import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { CorporateScoreCard } from "@/components/corporate/CorporateScoreCard";
import { CorporateScopeList } from "@/components/corporate/CorporateScopeList";
import { CorporateRelationshipsPanel } from "@/components/corporate/CorporateRelationshipsPanel";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";


export default async function CorporatePage() {
  const { role, realRole, user } = await requireProfileRole("/corporate", ["supplier", "exporter", "administrator"]);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id, full_name, organization_name, country, legal_entity_name, fda_registration_number")
    .eq("id", user.id)
    .maybeSingle();

  let supplierId: string | null = resolvePreviewedAccountId(realRole, profile?.supplier_id ?? null);

  // If supplier_id is not set on the profile, resolve in three steps:
  // 1. Match an existing suppliers row by org name
  // 2. Create a new suppliers row from profile data  ← needs admin client (RLS blocks supplier inserts)
  // 3. Write the resolved id back to profiles         ← needs admin client (FK may point to wrong table)
  // Skip entirely for administrators (previewing or not) — this bootstrap ties a
  // brand-new supplier row to the *signed-in* profile, which must never be an admin's.
  let provisioningFailed = false;

  if (!supplierId && realRole !== "administrator") {
    const orgName = profile?.organization_name ?? profile?.full_name ?? null;

    // Steps 1-3 all need the admin client: a brand-new user has no supplier_id yet,
    // so RLS (suppliers_read) can't show them an existing row to match against —
    // without this, every signup under the same company name silently created its
    // own duplicate supplier row instead of finding the one that already existed.
    try {
      const admin = createAdminSupabaseClient();

      if (orgName) {
        const { data: matchedSupplier } = await (admin.from("suppliers") as any)
          .select("id")
          .ilike("company_name", orgName)
          .maybeSingle();
        supplierId = matchedSupplier?.id ?? null;
      }

      if (!supplierId) {
        const { data: newSupplier } = await (admin.from("suppliers") as any)
          .insert({
            company_name:         profile?.organization_name ?? profile?.full_name ?? "Unnamed Exporter",
            legal_entity_name:    profile?.organization_name ?? null,
            country:              profile?.country ?? "US",
            contact_json:         profile?.full_name ? { name: profile.full_name } : {},
            address_json:         {},
            approval_status:      "pending_review",
            certification_status: "pending_review",
          })
          .select("id")
          .maybeSingle();
        supplierId = newSupplier?.id ?? null;
      }

      if (supplierId) {
        // Write back so subsequent loads skip this block entirely
        await (admin.from("profiles") as any)
          .update({ supplier_id: supplierId })
          .eq("id", user.id);
      }
    } catch {
      // Admin client not configured, or the insert/match failed — the user is left
      // without a supplier record, so surface it instead of failing silently.
      provisioningFailed = true;
    }
  }

  // Ensure a self-supply relationship exists so the exporter appears in My Suppliers
  // as their own production source (allows adding facilities/products under their own entity).
  // Skipped while an admin is previewing — viewing a page should never write data.
  if (supplierId && realRole !== "administrator") {
    try {
      const admin = createAdminSupabaseClient();
      const { data: selfLink } = await (admin.from("supplier_relationships") as any)
        .select("id")
        .eq("exporter_id", supplierId)
        .eq("supplier_id", supplierId)
        .eq("relationship_type", "self_supply")
        .maybeSingle();

      if (!selfLink) {
        await (admin.from("supplier_relationships") as any)
          .insert({
            exporter_id:       supplierId,
            supplier_id:       supplierId,
            relationship_type: "self_supply",
            status:            "active",
            notes:             "Own production",
          });
      }
    } catch {
      // Non-fatal — admin client not configured or relationship already exists
    }
  }

  // Fetch supplier using only columns that actually exist on the table.
  // Contact info lives in contact_json; status is approval_status / portal_status.
  const { data: supplier } = supplierId
    ? await (supabase.from("suppliers") as any)
        .select("company_name, legal_entity_name, country, fda_registration_number, contact_json, approval_status, portal_status, supplier_type")
        .eq("id", supplierId)
        .maybeSingle()
    : { data: null };

  const contactName: string =
    supplier?.contact_json?.name ??
    supplier?.contact_json?.primary_name ??
    profile?.full_name ??
    "Not recorded";

  const contactEmail: string | null =
    supplier?.contact_json?.email ??
    supplier?.contact_json?.primary_email ??
    null;

  // Profile completeness — based on fields the exporter can actually fill in.
  // contactEmail falls back to the auth email since every account has one.
  const resolvedContactEmail = contactEmail ?? user.email ?? null;
  const missingFields = [
    !(supplier?.legal_entity_name || profile?.legal_entity_name),
    !(supplier?.fda_registration_number || profile?.fda_registration_number),
    !resolvedContactEmail,
  ].filter(Boolean).length;

  const profileTone: StatusTone = missingFields === 0 ? "success" : missingFields <= 1 ? "warning" : "neutral";
  const profileStatus = missingFields === 0 ? "Profile Complete" : `${missingFields} field${missingFields > 1 ? "s" : ""} missing`;

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Company Overview"
        description="Manage exporter-level records, policies, contacts, attestations, and supplier-wide readiness requirements."
      />

      {provisioningFailed && (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold">We couldn&apos;t set up your company record automatically.</p>
          <p className="mt-1 text-amber-800">
            Some data below may be missing until this is resolved. Please contact support so we can create it manually.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* ── Left column ─────────────────────────────────────── */}
        <div className="flex flex-col gap-6">

          {/* 1. Readiness Score */}
          <CorporateScoreCard supplierId={supplierId} supabase={supabase} />

          {/* 3. Exporter Profile */}
          <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Exporter Profile
                </p>
                <h2 className="mt-2 text-xl font-semibold text-ink">
                  {supplier?.company_name ?? profile?.organization_name ?? "Company profile"}
                </h2>
              </div>
              <StatusBadge tone={profileTone}>
                {profileStatus}
              </StatusBadge>
            </div>

            <dl className="mt-5 space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-slate-500">Legal entity</dt>
                <dd className="mt-1 text-ink">{supplier?.legal_entity_name || profile?.legal_entity_name || "Not recorded"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Trading name</dt>
                <dd className="mt-1 text-ink">{supplier?.company_name || profile?.organization_name || "Not recorded"}</dd>
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
                  {supplier?.fda_registration_number || profile?.fda_registration_number || "Not recorded"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Primary contact</dt>
                <dd className="mt-1 text-ink">
                  {contactName}
                  {contactEmail && (
                    <span className="block text-slate-500">{contactEmail}</span>
                  )}
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
          <h2 className="text-base font-semibold text-ink">Company Overview Readiness Requirements</h2>
          <p className="mt-1 text-sm text-slate-500">
            Click any section to upload evidence or view progress.
            Accepted documents count toward your readiness score.
          </p>
          <CorporateScopeList supplierId={supplierId} supabase={supabase} />
        </section>
      </div>

      {/* ── Supply chain relationships ────────────────────────── */}
      {supplierId && (
        <div className="mt-6">
          <CorporateRelationshipsPanel supplierId={supplierId} supabase={supabase} />
        </div>
      )}
    </AppShell>
  );
}
