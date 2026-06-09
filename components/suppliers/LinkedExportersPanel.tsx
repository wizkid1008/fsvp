import Link from "next/link";
import { Building2, ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

type SupabaseLike = { from: (table: string) => any };

function approvalTone(status: string | null): StatusTone {
  if (status === "approved" || status === "active") return "success";
  if (status === "pending_review" || status === "pending") return "warning";
  if (status === "rejected" || status === "suspended") return "danger";
  return "neutral";
}

export async function LinkedExportersPanel({
  supplierId,
  supabase,
}: {
  supplierId: string | null;
  supabase: SupabaseLike;
}) {
  if (!supplierId) return null;

  const { data: links } = await (supabase.from("exporter_supplier_links") as any)
    .select(`
      id, status, accepted_at,
      exporter:exporter_id (
        id, company_name, country, approval_status, portal_status
      )
    `)
    .eq("supplier_id", supplierId)
    .eq("status", "active")
    .order("accepted_at", { ascending: false });

  const exporters = (links ?? []) as Array<{
    id: string;
    status: string;
    accepted_at: string | null;
    exporter: {
      id: string;
      company_name: string;
      country: string;
      approval_status: string | null;
      portal_status: string | null;
    } | null;
  }>;

  if (exporters.length === 0) return null;

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-base font-semibold text-ink">Exporters I Supply To</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Exporters that have linked your company to their supply chain.
          They can view and upload evidence for your facilities and products.
        </p>
      </div>

      <div className="divide-y divide-line">
        {exporters.map((link) => (
          <div key={link.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition">
            <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink">
                  {link.exporter?.company_name ?? "Unknown Exporter"}
                </p>
                <StatusBadge tone={approvalTone(link.exporter?.approval_status ?? null)}>
                  {link.exporter?.approval_status?.replace(/_/g, " ") ?? "Pending"}
                </StatusBadge>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {link.exporter?.country ?? ""}
                {link.accepted_at
                  ? ` · Linked ${new Date(link.accepted_at).toLocaleDateString()}`
                  : ""}
              </p>
            </div>
            {link.exporter && (
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/facilities?view=${link.exporter.id}`}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-line px-3 text-xs font-medium text-slate-600 hover:border-forest hover:text-forest transition"
                >
                  Their Facilities <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
