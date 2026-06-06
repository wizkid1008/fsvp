import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Warehouse } from "lucide-react";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function certTone(status: string): StatusTone {
  if (status === "active" || status === "approved") return "success";
  if (status === "pending_review") return "warning";
  if (status === "rejected" || status === "suspended") return "danger";
  return "neutral";
}

export default async function FacilitiesPage() {
  const { role } = await requireProfileRole("/facilities");
  const supabase = createServerSupabaseClient();

  type FacilityRow = { id: string; facility_name: string; facility_type: string; fda_registration_number: string | null; food_safety_certifications: string[] | null; supplier_id: string | null; suppliers: { company_name: string } | null };

  const { data: rawFacilities } = await supabase
    .from("facilities_verify")
    .select("id, facility_name, facility_type, fda_registration_number, food_safety_certifications, supplier_id")
    .order("created_at", { ascending: false });

  const facilities = (rawFacilities ?? []) as unknown as FacilityRow[];

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Facilities"
        description="Manage manufacturing facilities, FDA registrations, processes, certifications, and production capacity."
        action={{ label: "Add facility", href: "/facilities/new" }}
      />

      {!facilities || facilities.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="No facilities recorded"
          description="Add manufacturing and storage facilities to link them to suppliers and map their food safety certifications."
          action={{ label: "Add your first facility", href: "/facilities/new" }}
        />
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Facility</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">FDA Registration</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Certifications</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {facilities.map((facility) => (
                <tr key={facility.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{facility.facility_name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {(facility.suppliers as { company_name: string } | null)?.company_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{facility.facility_type}</td>
                  <td className="px-4 py-3 text-slate-600">{facility.fda_registration_number ?? "—"}</td>
                  <td className="px-4 py-3">
                    {facility.food_safety_certifications && facility.food_safety_certifications.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {facility.food_safety_certifications.map((cert) => (
                          <StatusBadge key={cert} tone="success">{cert}</StatusBadge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400">None on file</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
