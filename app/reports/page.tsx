import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ReportsPageClient } from "@/components/reports/ReportsPageClient";
import { previewedImporterFilter } from "@/lib/preview-role";

export const runtime = "edge";

export default async function ReportsPage() {
  const { role, realRole } = await requireProfileRole("/reports");
  const supabase = createServerSupabaseClient();

  let reportsQuery = (supabase.from("generated_reports") as any)
    .select("id, title, report_type, export_format, generated_at")
    .order("generated_at", { ascending: false });
  // An administrator previewing an importer sees that importer's, not all.
  const previewedImporter = previewedImporterFilter(realRole, role);
  if (previewedImporter) reportsQuery = reportsQuery.eq("importer_id", previewedImporter);
  const { data: rawReports } = await reportsQuery;

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
