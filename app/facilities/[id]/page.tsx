import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { FacilityScoreCard } from "@/components/facilities/FacilityScoreCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupplierType } from "@/lib/supplier-context";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function evidenceTone(status: string | null): StatusTone {
  if (status === "accepted") return "success";
  if (status === "under_review") return "info";
  if (status === "submitted") return "warning";
  if (status === "needs_revision" || status === "rejected" || status === "expired") return "danger";
  return "neutral";
}

function approvalTone(status: string | null): StatusTone {
  if (status === "approved") return "success";
  if (status === "conditionally_approved") return "warning";
  if (status === "improvement_required" || status === "not_approved" || status === "suspended") return "danger";
  return "neutral";
}

export default async function FacilityDetailPage({ params }: { params: { id: string } }) {
  const { role, user } = await requireProfileRole(`/facilities/${params.id}`);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id")
    .eq("id", user.id)
    .maybeSingle();
  const ownSupplierId: string | null = role === "supplier" ? (profile?.supplier_id ?? null) : null;

  const { data: facility } = await (supabase.from("facilities_verify") as any)
    .select("id, facility_name, facility_type, approval_status, supplier_id, suppliers(company_name)")
    .eq("id", params.id)
    .maybeSingle();

  if (!facility) notFound();

  const { data: facilityDocs } = await (supabase.from("documents") as any)
    .select("id, title, document_kind, evidence_status, uploaded_at, original_filename")
    .eq("facility_id", params.id)
    .is("soft_deleted_at", null)
    .order("uploaded_at", { ascending: false });

  const { data: supplierWideDocs } = await (supabase.from("documents") as any)
    .select("id, title, document_kind, evidence_status, uploaded_at, original_filename")
    .eq("supplier_id", facility.supplier_id)
    .eq("linked_entity_type", "supplier")
    .is("soft_deleted_at", null)
    .order("uploaded_at", { ascending: false });

  return (
    <AppShell role={role} supplierType={await getSupplierType(supabase as any, ownSupplierId)}>
      <SectionHeader
        title={facility.facility_name}
        description={facility.suppliers?.company_name ?? "Facility detail"}
      />

      <div className="mt-2 flex items-center gap-2">
        <StatusBadge tone={approvalTone(facility.approval_status)}>
          {(facility.approval_status ?? "pending").replace(/_/g, " ")}
        </StatusBadge>
        <Link href="/facilities" className="text-sm text-forest hover:underline">
          ← Back to all facilities
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        <FacilityScoreCard facilityId={params.id} supabase={supabase} />

        <div className="space-y-6">
          <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <h2 className="text-base font-semibold text-ink">Documents tagged to this facility</h2>
            <p className="mt-1 text-sm text-slate-500">
              These documents count toward this facility's score. Use Evidence Review to re-tag a document
              between supplier-wide and a specific facility.
            </p>
            {(facilityDocs ?? []).length === 0 ? (
              <p className="mt-4 rounded-md border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No documents are tagged to this facility yet.
              </p>
            ) : (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Document</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Submitted</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(facilityDocs ?? []).map((doc: any) => (
                    <tr key={doc.id}>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-ink">{doc.title}</p>
                        {doc.original_filename && <p className="text-xs text-slate-400">{doc.original_filename}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge tone={evidenceTone(doc.evidence_status)}>
                          {(doc.evidence_status ?? "not_submitted").replace(/_/g, " ")}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <h2 className="text-base font-semibold text-ink">Supplier-wide (exporter level) documents</h2>
            <p className="mt-1 text-sm text-slate-500">
              These belong to the exporter as a whole, not this specific facility, and don't count toward this
              facility's score.
            </p>
            {(supplierWideDocs ?? []).length === 0 ? (
              <p className="mt-4 rounded-md border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No supplier-wide documents on file.
              </p>
            ) : (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Document</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Submitted</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(supplierWideDocs ?? []).map((doc: any) => (
                    <tr key={doc.id}>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-ink">{doc.title}</p>
                        {doc.original_filename && <p className="text-xs text-slate-400">{doc.original_filename}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge tone={evidenceTone(doc.evidence_status)}>
                          {(doc.evidence_status ?? "not_submitted").replace(/_/g, " ")}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
