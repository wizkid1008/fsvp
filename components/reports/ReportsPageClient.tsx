"use client";

import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { GenerateReportModal } from "./GenerateReportModal";

type ReportRow = {
  id: string;
  title: string;
  report_type: string;
  export_format: string;
  generated_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  supplier_readiness: "Supplier Readiness",
  compliance_gap: "Compliance Gap Register",
  document_status: "Document Status Index",
};

interface Props {
  reports: ReportRow[];
  canGenerate: boolean;
}

export function ReportsPageClient({ reports, canGenerate }: Props) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {canGenerate && (
        <div className="mt-1 flex justify-end">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-forest px-3 py-2 text-sm font-semibold text-white hover:bg-forest/90"
          >
            <Plus className="h-4 w-4" />
            Generate Report
          </button>
        </div>
      )}

      {reports.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={FileText}
            title="No reports generated yet"
            description="Generate a supplier readiness summary, compliance gap register, or document status index as CSV or printable HTML."
            action={canGenerate ? { label: "Generate Report", href: "#" } : undefined}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-line bg-white shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Title</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Format</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Generated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-ink">{r.title}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {TYPE_LABELS[r.report_type] ?? r.report_type}
                  </td>
                  <td className="px-4 py-3 text-slate-600 uppercase text-xs font-semibold">
                    {r.export_format}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(r.generated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <GenerateReportModal onClose={() => setShowModal(false)} />}
    </>
  );
}
