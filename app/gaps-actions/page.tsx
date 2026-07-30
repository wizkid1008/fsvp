import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { GapsActionsClient } from "@/components/corrective-actions/GapsActionsClient";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "edge";

export default async function GapsActionsPage() {
  const { role, realRole } = await requireProfileRole("/gaps-actions");
  const supabase = createServerSupabaseClient();

  const { data: rawActions } = await (supabase.from("corrective_actions") as any)
    // food_id was dropped with the legacy `foods` table; product_id replaces it.
    .select("id, issue_description, triggered_by, status, triggered_at, closed_at, supplier_id, product_id, investigation_summary, action_taken, decision")
    .order("triggered_at", { ascending: false });

  const actions = rawActions ?? [];
  const canCreate = role === "us_importer" || role === "reviewer" || role === "administrator";

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Gaps & Actions"
        description="Track open corrective actions from verification findings, rejected evidence, recalls, and reassessments."
      />
      <GapsActionsClient actions={actions} canCreate={canCreate} />
    </AppShell>
  );
}
