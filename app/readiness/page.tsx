import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ReadinessPageClient } from "@/components/readiness/ReadinessPageClient";

export const runtime = "edge";

export default async function ReadinessPage() {
  const { role } = await requireProfileRole("/readiness");
  const supabase = createServerSupabaseClient();

  const { data: rawAssessments } = await (supabase.from("readiness_assessments") as any)
    .select("id, overall_score, status, gap_summary, recommended_actions, submitted_at, created_at, supplier_id")
    .order("created_at", { ascending: false });

  const assessments = rawAssessments ?? [];
  const canAssess = role === "us_importer" || role === "reviewer" || role === "administrator";

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Readiness"
        description="Review your overall FSVP readiness score, identify critical gaps, and generate audit-ready reports."
      />
      <ReadinessPageClient assessments={assessments} canAssess={canAssess} />
    </AppShell>
  );
}
