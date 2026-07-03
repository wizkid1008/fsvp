import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { FacilityScoreCard } from "@/components/facilities/FacilityScoreCard";
import { RequiredEvidenceChecklist } from "@/components/evidence/RequiredEvidenceChecklist";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupplierType } from "@/lib/supplier-context";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";


function approvalTone(status: string | null): StatusTone {
  if (status === "approved") return "success";
  if (status === "conditionally_approved") return "warning";
  if (status === "improvement_required" || status === "not_approved" || status === "suspended") return "danger";
  return "neutral";
}

export default async function FacilityDetailPage({ params }: { params: { id: string } }) {
  const { role, realRole, user } = await requireProfileRole(`/facilities/${params.id}`);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id")
    .eq("id", user.id)
    .maybeSingle();
  const ownSupplierId: string | null =
    role === "supplier" ? resolvePreviewedAccountId(realRole, profile?.supplier_id ?? null) : null;

  const { data: facility } = await (supabase.from("facilities_verify") as any)
    .select("id, facility_name, facility_type, approval_status, supplier_id, suppliers(company_name)")
    .eq("id", params.id)
    .maybeSingle();

  if (!facility) notFound();

  return (
    <AppShell role={role} realRole={realRole} supplierType={await getSupplierType(supabase as any, ownSupplierId)}>
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
            <h2 className="text-base font-semibold text-ink">Required Documents</h2>
            <p className="mt-1 text-sm text-slate-500">
              These are the specific documents this facility needs. Click "Upload" next to any missing or
              rejected item to attach it directly.
            </p>
            <RequiredEvidenceChecklist linkType="facility" entityId={params.id} supplierId={facility.supplier_id} supabase={supabase} />
          </section>

        </div>
      </div>
    </AppShell>
  );
}
