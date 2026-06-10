import Link from "next/link";
import { ClipboardCheck, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

type SupabaseLike = { from: (table: string) => any };

export async function ReviewerDashboard({
  displayName,
  supabase,
}: {
  displayName: string;
  supabase: SupabaseLike;
}) {
  const [pendingRes, recentRes, supplierRes] = await Promise.all([
    (supabase.from("documents") as any)
      .select("id", { count: "exact", head: true })
      .eq("evidence_status", "submitted")
      .is("soft_deleted_at", null),

    (supabase.from("documents") as any)
      .select("id, title, evidence_status, uploaded_at, supplier_id, suppliers(company_name)")
      .in("evidence_status", ["submitted", "under_review"])
      .is("soft_deleted_at", null)
      .order("uploaded_at", { ascending: true })
      .limit(10),

    (supabase.from("documents") as any)
      .select("supplier_id, evidence_status, suppliers(company_name)")
      .in("evidence_status", ["submitted", "under_review"])
      .is("soft_deleted_at", null),
  ]);

  const pendingCount = (pendingRes as any).count ?? 0;
  const queue = (recentRes.data ?? []) as Array<{
    id: string;
    title: string;
    evidence_status: string;
    uploaded_at: string;
    suppliers: { company_name: string } | null;
  }>;

  // Group by supplier
  const bySupplier = new Map<string, { name: string; count: number }>();
  for (const doc of (supplierRes.data ?? []) as Array<{ supplier_id: string | null; suppliers: { company_name: string } | null }>) {
    if (!doc.supplier_id) continue;
    const entry = bySupplier.get(doc.supplier_id) ?? { name: doc.suppliers?.company_name ?? "Unknown", count: 0 };
    entry.count++;
    bySupplier.set(doc.supplier_id, entry);
  }
  const supplierQueue = Array.from(bySupplier.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <h1 className="text-xl font-semibold text-ink">Review Queue</h1>
        <p className="mt-1 text-sm text-slate-500">Welcome back, {displayName}</p>
        {pendingCount > 0 ? (
          <p className="mt-2 text-sm font-semibold text-amber-700">
            {pendingCount} document{pendingCount > 1 ? "s" : ""} awaiting review
          </p>
        ) : (
          <p className="mt-2 text-sm text-emerald-700 font-semibold">Queue is clear — no documents pending review.</p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Oldest pending docs */}
        <section className="rounded-lg border border-line bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Oldest Pending</h2>
            <Link href="/reviewer" className="text-xs font-semibold text-forest hover:underline">Open queue →</Link>
          </div>
          {queue.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No documents pending review.</div>
          ) : (
            <div className="divide-y divide-line">
              {queue.map((doc) => (
                <Link key={doc.id} href="/reviewer"
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 transition">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{doc.title}</p>
                    <p className="text-xs text-slate-400">
                      {doc.suppliers?.company_name} · {new Date(doc.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge tone={doc.evidence_status === "submitted" ? "warning" : "info"}>
                    {doc.evidence_status === "submitted" ? "New" : "In Review"}
                  </StatusBadge>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* By supplier */}
        <section className="rounded-lg border border-line bg-white shadow-soft">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">By Supplier</h2>
          </div>
          {supplierQueue.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No pending reviews.</div>
          ) : (
            <div className="divide-y divide-line">
              {supplierQueue.map(([id, info]) => (
                <div key={id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <p className="truncate text-sm font-medium text-ink">{info.name}</p>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                    {info.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
