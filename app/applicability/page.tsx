import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ApplicabilityClient, type PairRow, type EntitySizeRow } from "@/components/applicability/ApplicabilityClient";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { isActiveOn } from "@/lib/fsvp/qualified-individuals";

export const runtime = "edge";

export default async function ApplicabilityPage() {
  const { role, realRole, user } = await requireProfileRole("/applicability", [
    "us_importer", "reviewer", "administrator",
  ]);
  const supabase = createServerSupabaseClient();
  const admin = createAdminSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const importerId: string | null = resolvePreviewedAccountId(realRole, profile?.importer_id ?? null);

  if (!importerId) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader
          title="FSVP Applicability"
          description="Whether the Foreign Supplier Verification Program applies to each food you import, and on what authority."
        />
        <div className="mt-6 rounded-lg border border-line bg-white px-6 py-10 text-center">
          <p className="text-sm text-slate-600">
            Your account is not linked to an importing organization yet.
          </p>
        </div>
      </AppShell>
    );
  }

  // Every supplier/product pair this importer has, whether determined or not —
  // the point of the page is to show what has NOT been determined.
  const { data: links } = await (admin.from("supplier_relationships") as any)
    .select("supplier_id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", importerId)
    .in("status", ["active", "pending_invite"]);

  const supplierIds = ((links ?? []) as Array<{ supplier_id: string }>)
    .map((l) => l.supplier_id)
    .filter(Boolean);

  const [{ data: rawProducts }, { data: rawDeterminations }, { data: rawSizes }, { data: qi }] =
    await Promise.all([
      supplierIds.length
        ? (admin.from("products_verify") as any)
            .select("id, product_name, supplier_id, suppliers(company_name)")
            .in("supplier_id", supplierIds)
            .order("product_name")
        : Promise.resolve({ data: [] }),

      (admin.from("fsvp_applicability_determinations") as any)
        .select(`
          id, supplier_id, product_id, outcome, basis, citation, rationale,
          determined_at, expires_at,
          qualified_individuals(profile_id)
        `)
        .eq("importer_id", importerId)
        .is("superseded_at", null),

      (admin.from("entity_size_determinations") as any)
        .select("id, food_scope, three_year_average, currency, determined_at, expires_at")
        .eq("importer_id", importerId)
        .order("determined_at", { ascending: false }),

      (admin.from("qualified_individuals") as any)
        .select("id, active_from, active_to")
        .eq("profile_id", user.id)
        .eq("importer_id", importerId)
        .maybeSingle(),
    ]);

  type RawProduct = {
    id: string;
    product_name: string;
    supplier_id: string;
    suppliers: { company_name: string } | null;
  };
  type RawDetermination = {
    id: string;
    supplier_id: string;
    product_id: string;
    outcome: "in_scope" | "exempt" | "modified";
    basis: string;
    citation: string;
    rationale: string;
    determined_at: string;
    expires_at: string | null;
    qualified_individuals: { profile_id: string } | null;
  };

  const determinations = (rawDeterminations ?? []) as RawDetermination[];
  const byProduct = new Map(determinations.map((d) => [d.product_id, d]));

  // Signer names come from profiles, whose RLS exposes only the caller's row.
  const signerIds = [
    ...new Set(determinations.map((d) => d.qualified_individuals?.profile_id).filter(Boolean)),
  ] as string[];
  const { data: rawSigners } = signerIds.length > 0
    ? await (admin.from("profiles") as any).select("id, full_name, email").in("id", signerIds)
    : { data: [] };
  const signerName = new Map(
    ((rawSigners ?? []) as Array<{ id: string; full_name: string | null; email: string }>)
      .map((p) => [p.id, p.full_name ?? p.email])
  );

  const pairs: PairRow[] = ((rawProducts ?? []) as RawProduct[]).map((p) => {
    const d = byProduct.get(p.id) ?? null;
    return {
      supplier_id:   p.supplier_id,
      supplier_name: p.suppliers?.company_name ?? "Exporter",
      product_id:    p.id,
      product_name:  p.product_name,
      determination: d
        ? {
            id:            d.id,
            outcome:       d.outcome,
            basis:         d.basis,
            citation:      d.citation,
            rationale:     d.rationale,
            determined_at: d.determined_at,
            expires_at:    d.expires_at,
            signer_name:   signerName.get(d.qualified_individuals?.profile_id ?? "") ?? "Unknown",
          }
        : null,
    };
  });

  const canManageSize = role === "us_importer" || role === "administrator";

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="FSVP Applicability"
        description={
          "Not every imported food is subject to FSVP. 21 CFR 1.501 exempts whole categories outright, " +
          "and §§ 1.511–1.513 reduce what is required for very small importers, small foreign suppliers, " +
          "dietary supplements and recognized country systems. A qualified individual decides which " +
          "applies to each food — and that decision governs what the rest of the platform asks of it."
        }
      />
      <ApplicabilityClient
        pairs={pairs}
        entitySizes={(rawSizes ?? []) as EntitySizeRow[]}
        viewerIsActiveQi={Boolean(qi && isActiveOn(qi))}
        canManageSize={canManageSize}
      />
    </AppShell>
  );
}
