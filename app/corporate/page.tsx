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
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function approvalTone(status: string | null): StatusTone {
  if (status === "approved" || status === "active") return "success";
  if (status === "pending" || status === "pending_review") return "warning";
  if (status === "rejected" || status === "suspended") return "danger";
  return "neutral";
}

function approvalLabel(status: string | null): string {
  if (!status) return "Pending";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function CorporatePage() {
  const { role, user } = await requireProfileRole("/corporate", ["supplier", "administrator"]);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id, full_name, organization_name, country")
    .eq("id", user.id)
    .maybeSingle();

  let supplierId: string | null = profile?.supplier_id ?? null;

  // If supplier_id is not set on the profile, resolve in three steps:
  // 1. Match an existing suppliers row by org name
  // 2. Create a new suppliers row from profile data  ← needs admin client (RLS blocks supplier inserts)
  // 3. Write the resolved id back to profiles         ← needs admin client (FK may point to wrong table)
  if (!supplierId) {
    const orgName = profile?.organization_name ?? profile?.full_name ?? null;

    // Step 1 — user-scoped read is fine (existing row is readable via name match)
    if (orgName) {
      const { data: matchedSupplier } = await (supabase.from("suppliers") as any)
        .select("id")
        .ilike("company_name", orgName)
        .maybeSingle();
      supplierId = matchedSupplier?.id ?? null;
    }

    // Steps 2 + 3 — use admin client to bypass RLS for the bootstrap insert/update
    try {
      const admin = createAdminSupabaseClient();

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
      // Non-fatal — admin client not configured (local dev without service key)
    }
  }

  // Fetch supplier using only columns that actually exist on the table.
  // Contact info lives in contact_json; status is approval_status / portal_status.
  const { data: supplier } = supplierId
    ? await (supabase.from("suppliers") as any)
        .select("company_name, legal_entity_name, country, fda_registration_number, contact_json, approval_status, portal_status")
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

  const statusValue: string | null =
    supplier?.approval_status ?? supplier?.portal_status ?? null;

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
              <StatusBadge tone={approvalTone(statusValue)}>
                {approvalLabel(statusValue)}
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
          <h2 className="text-base font-semibold text-ink">Corporate Readiness Requirements</h2>
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
