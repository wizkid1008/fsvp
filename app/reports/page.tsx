import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FileCheck2 } from "lucide-react";

export const runtime = "edge";

const FORMAT_LABELS: Record<string, string> = { pdf: "PDF", excel: "Excel" };

export default async function ReportsPage() {
  const { role } = await requireProfileRole("/reports");
  const supabase = createServerSupabaseClient();

  type ReportRow = { id: string; title: string; report_type: string; export_format: string; generated_at: string };

  const { data: rawReports } = await supabase
    .from("generated_reports")
    .select("id, title, report_type, export_format, generated_at")
    .order("generated_at", { ascending: false });

  const reports = (rawReports ?? []) as unknown as ReportRow[];

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Reports"
        description="Generate and export audit-ready FSVP reports including readiness summaries, gap registers, and evidence indexes."
        action={{ label: "Generate report", href: "#" }}
      />

      {!reports || reports.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No reports generated yet"
          description="Generate a readiness report once suppliers, evidence, and an assessment are complete. Reports export as PDF or Excel."
          action={{ label: "Go to Readiness", href: "/readiness" }}
        />
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Report</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Format</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Generated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{report.title}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{report.report_type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone="info">{FORMAT_LABELS[report.export_format] ?? report.export_format}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{new Date(report.generated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
