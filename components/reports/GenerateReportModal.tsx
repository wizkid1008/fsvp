"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";

interface Props {
  onClose: () => void;
}

const REPORT_TYPES = [
  { value: "supplier_readiness", label: "Supplier Readiness" },
  { value: "compliance_gap", label: "Compliance Gap Register" },
  { value: "document_status", label: "Document Status Index" },
];

export function GenerateReportModal({ onClose }: Props) {
  const router = useRouter();
  const [reportType, setReportType] = useState("supplier_readiness");
  const [format, setFormat] = useState<"csv" | "html">("csv");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_type: reportType, format }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to generate report");
      }

      if (format === "csv") {
        const text = await res.text();
        const blob = new Blob([text], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${reportType}_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const html = await res.text();
        const w = window.open("", "_blank");
        if (w) { w.document.write(html); w.document.close(); }
      }

      router.refresh();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Generate Report</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Format</label>
            <div className="flex gap-4">
              {(["csv", "html"] as const).map((f) => (
                <label key={f} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="format"
                    value={f}
                    checked={format === f}
                    onChange={() => setFormat(f)}
                    className="accent-forest"
                  />
                  <span className="text-sm text-slate-700">
                    {f === "csv" ? "CSV (download)" : "HTML (print to PDF)"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={generating}
              className="flex items-center gap-2 rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest/90 disabled:opacity-50"
            >
              {generating && <Loader2 className="h-4 w-4 animate-spin" />}
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
