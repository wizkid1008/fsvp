import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import { ConfigurationNotice } from "@/components/ui/ConfigurationNotice";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { ReadinessPageClient } from "@/components/readiness/ReadinessPageClient";
import { SectionReadinessList } from "@/components/readiness/SectionReadinessList";

export const runtime = "edge";

export default async function ReadinessPage({
  searchParams,
}: {
  searchParams: { supplier?: string };
}) {
  const { role, realRole, user } = await requireProfileRole("/readiness");
  const supabase = createServerSupabaseClient();

  const adminResult = tryAdminClient();
  if (!adminResult.ok) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader title="Readiness" description="" />
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

  // Readiness is assessed per supplier, not per importer. The page previously
  // rendered assessments[0] — simply the most recent row, whichever supplier it
  // belonged to — as a single "Overall Readiness" score, and never resolved the
  // supplier name at all.
  const { data: links } = importerId
    ? await (admin.from("supplier_relationships") as any)
        .select("supplier_id")
        .eq("relationship_type", "importer_supplier")
        .eq("importer_id", importerId)
        .in("status", ["active", "pending_invite"])
    : { data: [] };

  const linkedIds = ((links ?? []) as Array<{ supplier_id: string }>)
    .map((l) => l.supplier_id)
    .filter(Boolean);

  const { data: supplierRows } = linkedIds.length
    ? await (admin.from("suppliers") as any)
        .select("id, company_name, country")
        .in("id", linkedIds)
        .order("company_name")
    : { data: [] };

  const suppliers = (supplierRows ?? []) as Array<{ id: string; company_name: string; country: string }>;
  const supplierName = new Map(suppliers.map((s) => [s.id, s.company_name]));

  const { data: rawAssessments } = await (supabase.from("readiness_assessments") as any)
    .select("id, overall_score, status, gap_summary, recommended_actions, submitted_at, created_at, supplier_id")
    .order("created_at", { ascending: false });

  type RawAssessment = {
    id: string;
    overall_score: number;
    status: string;
    gap_summary: string | null;
    recommended_actions: string | null;
    submitted_at: string | null;
    created_at: string;
    supplier_id: string;
  };

  const assessments = ((rawAssessments ?? []) as RawAssessment[]).map((a) => ({
    ...a,
    supplier_name: supplierName.get(a.supplier_id) ?? "Unknown supplier",
  }));

  // Default to the supplier with the most recent assessment, so the page opens
  // on something meaningful rather than empty.
  const selectedSupplierId =
    searchParams.supplier && suppliers.some((s) => s.id === searchParams.supplier)
      ? searchParams.supplier
      : assessments[0]?.supplier_id ?? suppliers[0]?.id ?? null;

  const canAssess = role === "us_importer" || role === "reviewer" || role === "administrator";

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Readiness"
        description="FSVP readiness is assessed per exporter. Select one to see its score, section breakdown, and outstanding gaps."
      />
      <ReadinessPageClient
        assessments={assessments}
        suppliers={suppliers}
        selectedSupplierId={selectedSupplierId}
        canAssess={canAssess}
      />

      {selectedSupplierId && (
        <div className="mt-6 space-y-6">
          <SectionReadinessList
            appliesTo="supplier"
            supplierId={selectedSupplierId}
            supabase={admin}
            title="Supplier-level requirements"
          />
          <SectionReadinessList
            appliesTo="facility"
            supplierId={selectedSupplierId}
            supabase={admin}
            title="Facility-level requirements"
          />
          <SectionReadinessList
            appliesTo="product"
            supplierId={selectedSupplierId}
            supabase={admin}
            title="Product-level requirements"
          />
        </div>
      )}
    </AppShell>
  );
}
