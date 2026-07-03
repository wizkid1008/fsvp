import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ReportsPageClient } from "@/components/reports/ReportsPageClient";

export const runtime = "edge";

export default async function ReportsPage() {
  const { role, realRole } = await requireProfileRole("/reports");
  const supabase = createServerSupabaseClient();

  const { data: rawReports } = await (supabase.from("generated_reports") as any)
    .select("id, title, report_type, export_format, generated_at")
    .order("generated_at", { ascending: false });

  const reports = rawReports ?? [];
  const canGenerate = role === "us_importer" || role === "reviewer" || role === "administrator";

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Reports"
        description="Generate and export audit-ready FSVP reports including readiness summaries, gap registers, and evidence indexes."
      />
      <ReportsPageClient reports={reports} canGenerate={canGenerate} />
    </AppShell>
  );
}
