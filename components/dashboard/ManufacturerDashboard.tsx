import Link from "next/link";
import { CheckCircle2, AlertCircle, Clock, ArrowRight, Warehouse, Package, FileText, Building2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

type SupabaseLike = { from: (table: string) => any };

export async function ManufacturerDashboard({
  supplierId,
  companyName,
  displayName,
  supabase,
}: {
  supplierId: string | null;
  companyName: string | null;
  displayName: string;
  supabase: SupabaseLike;
}) {
  const [facilitiesRes, productsRes, documentsRes, exporterLinksRes] = await Promise.all([
    supplierId
      ? (supabase.from("facilities_verify") as any)
          .select("id, facility_name")
          .eq("supplier_id", supplierId)
      : Promise.resolve({ data: [] }),

    supplierId
      ? (supabase.from("products_verify") as any)
          .select("id, product_name")
          .eq("supplier_id", supplierId)
      : Promise.resolve({ data: [] }),

    supplierId
      ? (supabase.from("documents") as any)
          .select("id, evidence_status, title, uploaded_at")
          .eq("supplier_id", supplierId)
          .is("soft_deleted_at", null)
          .order("uploaded_at", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),

    // Exporters that have linked this manufacturer
    supplierId
      ? (supabase.from("exporter_supplier_links") as any)
          .select("id, status, exporter:exporter_id(id, company_name, country)")
          .eq("supplier_id", supplierId)
          .eq("status", "active")
      : Promise.resolve({ data: [] }),
  ]);

  const facilities = (facilitiesRes.data ?? []) as Array<{ id: string; facility_name: string }>;
  const products   = (productsRes.data ?? []) as Array<{ id: string; product_name: string }>;
  const docs       = (documentsRes.data ?? []) as Array<{ id: string; evidence_status: string; title: string; uploaded_at: string }>;
  const exporters  = (exporterLinksRes.data ?? []) as Array<{ id: string; exporter: { id: string; company_name: string; country: string } | null }>;

  const accepted = docs.filter((d) => d.evidence_status === "accepted").length;
  const pending  = docs.filter((d) => ["submitted", "under_review"].includes(d.evidence_status)).length;

  function docTone(status: string): StatusTone {
    if (status === "accepted")                         return "success";
    if (status === "under_review")                     return "info";
    if (status === "submitted")                        return "warning";
    if (status === "needs_revision" || status === "rejected") return "danger";
    return "neutral";
  }
  function docLabel(status: string) {
    const map: Record<string, string> = {
      accepted:      "Accepted",
      under_review:  "Under Review",
      submitted:     "Submitted",
      needs_revision:"Needs Revision",
      rejected:      "Rejected",
    };
    return map[status] ?? status;
  }

  const steps = [
    { key: "facility", label: "Add at least one facility",  href: "/facilities", done: facilities.length > 0 },
    { key: "product",  label: "Add at least one product",   href: "/products",   done: products.length > 0 },
    { key: "evidence", label: "Upload facility evidence",    href: "/facilities", done: accepted > 0 },
  ];
  const incomplete = steps.filter((s) => !s.done);

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <h1 className="text-xl font-semibold text-ink">{companyName ?? displayName}</h1>
        <p className="mt-1 text-sm text-slate-500">Welcome back, {displayName}</p>
        {exporters.length > 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            You supply to{" "}
            {exporters.map((e, i) => (
              <span key={e.id}>
                {i > 0 && ", "}
                <Link href={`/facilities?view=${e.exporter?.id}`} className="font-semibold text-forest hover:underline">
                  {e.exporter?.company_name}
                </Link>
              </span>
            ))}.
          </p>
        ) : (
          <p className="mt-2 text-sm text-amber-700">Not yet linked to any exporter. Accept an invite to get started.</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Setup checklist */}
        <div className="space-y-4">
          {incomplete.length > 0 && (
            <section className="rounded-lg border border-line bg-white shadow-soft">
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-sm font-semibold text-ink">Setup Checklist</h2>
                <p className="mt-0.5 text-xs text-slate-500">Complete these so your exporter can submit your compliance docs to importers.</p>
              </div>
              <div className="divide-y divide-line">
                {steps.map((step) => (
                  <Link key={step.key} href={step.href}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition">
                    {step.done
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      : <Clock className="h-4 w-4 shrink-0 text-slate-300" />}
                    <span className={`flex-1 text-sm ${step.done ? "text-slate-400 line-through" : "font-medium text-ink"}`}>
                      {step.label}
                    </span>
                    {!step.done && <ArrowRight className="h-3.5 w-3.5 text-slate-300" />}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Recent evidence */}
          <section className="rounded-lg border border-line bg-white shadow-soft">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">Recent Evidence</h2>
              <Link href="/my-evidence" className="text-xs font-semibold text-forest hover:underline">
                View all →
              </Link>
            </div>
            {docs.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                No documents uploaded yet. Upload evidence from the Facilities and Products pages.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{doc.title}</p>
                      <p className="text-xs text-slate-400">{new Date(doc.uploaded_at).toLocaleDateString()}</p>
                    </div>
                    <StatusBadge tone={docTone(doc.evidence_status)}>
                      {docLabel(doc.evidence_status)}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Stats */}
        <div className="space-y-3">
          <Link href="/facilities" className="group flex items-center justify-between rounded-lg border border-line bg-white p-4 shadow-soft hover:border-forest transition">
            <div className="flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-slate-400 group-hover:text-forest" />
              <p className="text-sm font-semibold text-slate-600 group-hover:text-forest">Facilities</p>
            </div>
            <p className="text-2xl font-bold text-ink">{facilities.length}</p>
          </Link>
          <Link href="/products" className="group flex items-center justify-between rounded-lg border border-line bg-white p-4 shadow-soft hover:border-forest transition">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-400 group-hover:text-forest" />
              <p className="text-sm font-semibold text-slate-600 group-hover:text-forest">Products</p>
            </div>
            <p className="text-2xl font-bold text-ink">{products.length}</p>
          </Link>
          <Link href="/my-evidence" className="group flex items-center justify-between rounded-lg border border-line bg-white p-4 shadow-soft hover:border-forest transition">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400 group-hover:text-forest" />
              <p className="text-sm font-semibold text-slate-600 group-hover:text-forest">Accepted Docs</p>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{accepted}</p>
          </Link>
          {pending > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <p className="text-sm font-semibold text-amber-700">Awaiting Review</p>
              </div>
              <p className="text-2xl font-bold text-amber-600">{pending}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
