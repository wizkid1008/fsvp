import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { GapsActionsClient } from "@/components/corrective-actions/GapsActionsClient";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { previewedImporterFilter } from "@/lib/preview-role";

export const runtime = "edge";

export default async function GapsActionsPage() {
  const { role, realRole } = await requireProfileRole("/gaps-actions");
  const supabase = createServerSupabaseClient();

  let actionsQuery = (supabase.from("corrective_actions") as any)
    // food_id was dropped with the legacy `foods` table; product_id replaces it.
    .select("id, issue_description, triggered_by, status, triggered_at, closed_at, supplier_id, product_id, fsvp_record_id, investigation_summary, action_taken, decision, suppliers(company_name), products_verify(product_name)")
    .order("triggered_at", { ascending: false });
  // An administrator previewing an importer sees that importer's, not all.
  const previewedImporter = previewedImporterFilter(realRole, role);
  if (previewedImporter) actionsQuery = actionsQuery.eq("importer_id", previewedImporter);
  const { data: rawActions } = await actionsQuery;

  const actions = rawActions ?? [];
  const canCreate = role === "us_importer" || role === "reviewer" || role === "administrator";

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Gaps & Actions"
        description="Corrective actions from verification findings, rejected evidence, recalls and reassessments. Each names the exporter and product it is about, and an open one also shows in that product's next steps."
      />
      <GapsActionsClient actions={actions} canCreate={canCreate} />
    </AppShell>
  );
}
