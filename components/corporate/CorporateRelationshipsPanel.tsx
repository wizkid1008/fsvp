import Link from "next/link";
import { Building2, ExternalLink, ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

type SupabaseLike = { from: (table: string) => any };

function statusTone(status: string | null): StatusTone {
  if (status === "approved" || status === "active") return "success";
  if (status === "pending_review" || status === "pending") return "warning";
  if (status === "rejected" || status === "suspended") return "danger";
  return "neutral";
}

export async function CorporateRelationshipsPanel({
  supplierId,
  supabase,
}: {
  supplierId: string;
  supabase: SupabaseLike;
}) {
  // Fetch both directions in parallel
  const [upstreamRes, exporterRes] = await Promise.all([
    // Upstream suppliers this entity has linked (as exporter)
    (supabase.from("exporter_supplier_links") as any)
      .select(`
        id, status,
        supplier:supplier_id ( id, company_name, country, approval_status, supplier_type )
      `)
      .eq("exporter_id", supplierId)
      .in("status", ["active", "pending_invite"])
      .order("created_at", { ascending: false })
      .limit(5),

    // Exporters this entity supplies to (as upstream supplier)
    (supabase.from("exporter_supplier_links") as any)
      .select(`
        id, status,
        exporter:exporter_id ( id, company_name, country, approval_status )
      `)
      .eq("supplier_id", supplierId)
      .eq("status", "active")
      .order("accepted_at", { ascending: false })
      .limit(5),
  ]);

  const upstream = (upstreamRes.data ?? []) as Array<{
    id: string;
    status: string;
    supplier: { id: string; company_name: string; country: string; approval_status: string; supplier_type: string | null } | null;
  }>;

  const exporters = (exporterRes.data ?? []) as Array<{
    id: string;
    status: string;
    exporter: { id: string; company_name: string; country: string; approval_status: string } | null;
  }>;

  // Nothing to show
  if (upstream.length === 0 && exporters.length === 0) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Upstream suppliers */}
      {upstream.length > 0 && (
        <section className="rounded-lg border border-line bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">Upstream Suppliers</h2>
              <p className="mt-0.5 text-xs text-slate-500">Manufacturers / processors in your supply chain</p>
            </div>
            <Link
              href="/my-suppliers"
              className="flex items-center gap-1 text-xs font-semibold text-forest hover:underline"
            >
              Manage <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-line">
            {upstream.map((link) => (
              <div key={link.id} className="flex items-center gap-3 px-5 py-3">
                <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">
                    {link.supplier?.company_name ?? "Unknown"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {link.supplier?.country}
                    {link.supplier?.supplier_type
                      ? ` · ${link.supplier.supplier_type.replace(/_/g, " ")}`
                      : ""}
                  </p>
                </div>
                <StatusBadge tone={link.status === "active" ? "success" : "warning"}>
                  {link.status === "active" ? "Active" : "Invite Sent"}
                </StatusBadge>
                {link.status === "active" && link.supplier && (
                  <Link
                    href={`/facilities?view=${link.supplier.id}`}
                    className="shrink-0 text-xs text-slate-400 hover:text-forest"
                    title="View facilities"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Exporters I supply to */}
      {exporters.length > 0 && (
        <section className="rounded-lg border border-line bg-white shadow-soft">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Exporters I Supply To</h2>
            <p className="mt-0.5 text-xs text-slate-500">Traders / exporters that have linked your company</p>
          </div>
          <div className="divide-y divide-line">
            {exporters.map((link) => (
              <div key={link.id} className="flex items-center gap-3 px-5 py-3">
                <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">
                    {link.exporter?.company_name ?? "Unknown"}
                  </p>
                  <p className="text-xs text-slate-400">{link.exporter?.country}</p>
                </div>
                <StatusBadge tone={statusTone(link.exporter?.approval_status ?? null)}>
                  {link.exporter?.approval_status?.replace(/_/g, " ") ?? "Pending"}
                </StatusBadge>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
