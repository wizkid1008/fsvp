import Link from "next/link";
import { Plus, FolderCheck } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function recordTone(status: string): StatusTone {
  if (status === "importer_approved") return "success";
  if (status === "conditionally_approved") return "warning";
  if (status === "rejected") return "danger";
  if (status === "draft" || status === "awaiting_supplier_evidence") return "neutral";
  return "info";
}

function recordStatusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
    awaiting_supplier_evidence: "Awaiting Evidence",
    supplier_evidence_submitted: "Evidence Submitted",
    supplier_evidence_accepted: "Evidence Accepted",
    importer_review_pending: "Review Pending",
    importer_approved: "Approved",
    conditionally_approved: "Conditional",
    needs_corrective_action: "Needs Action",
    rejected: "Rejected",
    expired: "Expired",
    reassessment_due: "Reassessment Due",
  };
  return map[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function FsvpRecordsPage() {
  const { supabase, role } = await requireProfileRole("/fsvp-records", ["us_importer", "reviewer", "administrator"]);

  const { data: rawRecords } = await (supabase.from("fsvp_records") as any)
    .select(`
      id, status, overall_score, approved_at, reassessment_due_at, created_at,
      suppliers!inner(company_name, country),
      facilities_verify!inner(facility_name),
      products_verify!inner(product_name),
      rule_versions!inner(version_number)
    `)
    .order("created_at", { ascending: false });

  type RecordRow = {
    id: string;
    status: string;
    overall_score: number | null;
    approved_at: string | null;
    reassessment_due_at: string | null;
    created_at: string;
    suppliers: { company_name: string; country: string };
    facilities_verify: { facility_name: string };
    products_verify: { product_name: string };
    rule_versions: { version_number: number };
  };

  const records = (rawRecords ?? []) as RecordRow[];

  const approved = records.filter((r) => r.status === "importer_approved").length;
  const conditional = records.filter((r) => r.status === "conditionally_approved").length;
  const pending = records.filter((r) =>
    ["draft", "importer_review_pending", "supplier_evidence_accepted"].includes(r.status)
  ).length;
  const reassessmentDue = records.filter((r) => {
    if (!r.reassessment_due_at) return false;
    return new Date(r.reassessment_due_at) <= new Date();
  }).length;

  return (
    <AppShell role={role}>
      <SectionHeader
        title="FSVP Records"
        description="Importer-owned compliance records. Each record documents your decision to import a specific product from a specific supplier and facility under a specific rule version."
        actionSlot={
          <Link
            href="/fsvp-records/new"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#195f4d]"
          >
            <Plus className="h-4 w-4" />
            New Record
          </Link>
        }
      />

      {/* Summary metrics */}
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {[
          { label: "Approved", value: approved, tone: "success" as StatusTone },
          { label: "Conditional", value: conditional, tone: "warning" as StatusTone },
          { label: "Pending Review", value: pending, tone: "info" as StatusTone },
          { label: "Reassessment Due", value: reassessmentDue, tone: reassessmentDue > 0 ? "danger" as StatusTone : "neutral" as StatusTone },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <p className="text-xs font-medium text-slate-500">{m.label}</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-3xl font-semibold text-ink">{m.value}</p>
              <StatusBadge tone={m.tone}>{m.value > 0 ? "Active" : "None"}</StatusBadge>
            </div>
          </div>
        ))}
      </div>

      {records.length === 0 ? (
        <EmptyState
          icon={FolderCheck}
          title="No FSVP records yet"
          description="Create your first FSVP record by selecting a supplier, facility, and product combination."
          action={{ label: "New FSVP Record", href: "/fsvp-records/new" }}
        />
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Supplier</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Facility</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Product</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Rule</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Score</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Status</th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Reassessment</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {records.map((record) => {
                const overdue = record.reassessment_due_at && new Date(record.reassessment_due_at) <= new Date();
                return (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{record.suppliers.company_name}</p>
                      <p className="text-xs text-slate-400">{record.suppliers.country}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{record.facilities_verify.facility_name}</td>
                    <td className="px-4 py-3 text-slate-600">{record.products_verify.product_name}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">v{record.rule_versions.version_number}</td>
                    <td className="px-4 py-3">
                      {record.overall_score !== null ? (
                        <span className={`text-sm font-semibold ${
                          record.overall_score >= 90 ? "text-emerald-600" :
                          record.overall_score >= 75 ? "text-amber-600" :
                          record.overall_score >= 60 ? "text-orange-600" : "text-red-600"
                        }`}>
                          {record.overall_score.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={recordTone(record.status)}>
                        {recordStatusLabel(record.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {record.reassessment_due_at ? (
                        <span className={overdue ? "font-semibold text-red-600" : "text-slate-500"}>
                          {new Date(record.reassessment_due_at).toLocaleDateString()}
                          {overdue && " ⚠"}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/fsvp-records/${record.id}`}
                        className="inline-flex h-8 items-center rounded-md border border-line px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
