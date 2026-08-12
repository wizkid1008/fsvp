import Link from "next/link";
import { ClipboardCheck, Clock, CheckCircle2, AlertCircle, FileSignature, Scale, ShieldAlert } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fetchAttestationQueue } from "@/lib/fsvp/attestation-queue";

type SupabaseLike = { from: (table: string) => any };

export async function ReviewerDashboard({
  displayName,
  supabase,
}: {
  displayName: string;
  supabase: SupabaseLike;
}) {
  const [
    pendingRes,
    recentRes,
    supplierRes,
    fsvpRes,
    productsRes,
    determinationsRes,
    historyRes,
    screeningRes,
    attestationQueue,
  ] = await Promise.all([
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

    (supabase.from("fsvp_records") as any)
      .select("id, status, suppliers(company_name), products_verify(product_name)")
      .in("status", ["draft", "supplier_evidence_accepted", "importer_review_pending"])
      .limit(10),

    (supabase.from("products_verify") as any)
      .select("id")
      .not("supplier_id", "is", null)
      .not("commodity_id", "is", null),

    (supabase.from("fsvp_applicability_determinations") as any)
      .select("product_id, expires_at")
      .is("superseded_at", null),

    (supabase.from("supplier_compliance_history") as any)
      .select("id", { count: "exact", head: true })
      .eq("match_status", "candidate"),

    (supabase.from("supplier_compliance_screenings") as any)
      .select("id, supplier_id, expires_at, suppliers(company_name)")
      .is("superseded_at", null)
      .lte("expires_at", new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10))
      .limit(10),

    // Scoped by RLS: a tenant reviewer sees their own importer's records, a
    // platform reviewer sees all of them.
    fetchAttestationQueue(supabase),
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
  const fsvpQueue = (fsvpRes.data ?? []) as Array<{
    id: string;
    status: string;
    suppliers: { company_name: string } | null;
    products_verify: { product_name: string } | null;
  }>;
  const historyCandidates = (historyRes as any).count ?? 0;
  const screeningsDue = (screeningRes.data ?? []) as Array<{
    id: string;
    expires_at: string | null;
    suppliers: { company_name: string } | null;
  }>;
  const today = new Date().toISOString().slice(0, 10);
  const liveApplicability = new Set(
    ((determinationsRes.data ?? []) as Array<{ product_id: string; expires_at: string | null }>)
      .filter((row) => !row.expires_at || row.expires_at >= today)
      .map((row) => row.product_id)
  );
  const applicabilityGaps = ((productsRes.data ?? []) as Array<{ id: string }>)
    .filter((product) => !liveApplicability.has(product.id)).length;

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
        {attestationQueue.length === 0 && (
          <p className="mt-1 text-sm text-emerald-700">
            Every open FSVP record carries current qualified-individual signatures.
          </p>
        )}
      </section>

      {/* First, because it is the only thing on this page that nobody else can
          do. The importer dashboard has counted "Records unsigned" all along;
          the person who signs them had no such list anywhere. */}
      {attestationQueue.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-white shadow-soft">
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <FileSignature className="h-4 w-4" />
              Awaiting your signature
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-amber-800">
              A qualified individual must sign the hazard analysis (§ 1.504), supplier evaluation
              (§ 1.505) and verification determination (§ 1.506) before a record can be approved.
            </p>
          </div>
          <div className="divide-y divide-line">
            {attestationQueue.map((item) => (
              <Link
                key={item.recordId}
                href={`/fsvp-records/${item.recordId}`}
                className="flex items-start justify-between gap-3 px-5 py-3 transition hover:bg-amber-50/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {item.productName ?? "FSVP record"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {item.supplierName ?? "Supplier"} · {item.status.replace(/_/g, " ")}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {item.reasons.map((reason) => (
                      <li key={reason} className="text-xs leading-5 text-amber-800">
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
                <StatusBadge tone="warning">
                  {item.reasons.length} to sign
                </StatusBadge>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-line bg-white shadow-soft">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Qualified-individual workbench</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Decisions that can block FSVP approval, grouped by the kind of judgment needed.
          </p>
        </div>
        <div className="grid divide-y divide-line md:grid-cols-4 md:divide-x md:divide-y-0">
          {[
            { label: "FSVP records", value: fsvpQueue.length, href: "/fsvp-records", icon: FileSignature },
            { label: "Applicability", value: applicabilityGaps, href: "/applicability", icon: Scale },
            { label: "FDA matches", value: historyCandidates, href: "/compliance-history", icon: ShieldAlert },
            { label: "Screenings due", value: screeningsDue.length, href: "/compliance-history", icon: Clock },
          ].map((item) => (
            <Link key={item.label} href={item.href} className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50">
              <div className="flex min-w-0 items-center gap-3">
                <item.icon className="h-4 w-4 shrink-0 text-slate-400" />
                <p className="truncate text-sm font-semibold text-slate-700">{item.label}</p>
              </div>
              <StatusBadge tone={item.value > 0 ? "warning" : "success"}>{item.value}</StatusBadge>
            </Link>
          ))}
        </div>
        {fsvpQueue.length > 0 && (
          <div className="divide-y divide-line border-t border-line">
            {fsvpQueue.slice(0, 4).map((record) => (
              <Link key={record.id} href={`/fsvp-records/${record.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{record.products_verify?.product_name ?? "FSVP record"}</p>
                  <p className="text-xs text-slate-500">{record.suppliers?.company_name ?? "Supplier"} - {record.status.replace(/_/g, " ")}</p>
                </div>
                <StatusBadge tone="info">Open</StatusBadge>
              </Link>
            ))}
          </div>
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
