import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Clock, FileWarning, Package, ShieldAlert } from "lucide-react";
import { ExporterCountCards } from "@/components/products/ProductCountCards";
import { EvidenceOverviewCard } from "./EvidenceOverview";
import { DeadlineRow, DeadlinesSection } from "./DeadlinesSection";
import { SupplierResponseForm } from "@/components/corrective-actions/SupplierResponseForm";
import { fetchEvidenceProgress } from "@/lib/readiness/evidence-progress";
import { countEvidenceStandings, DOCUMENT_EXPIRY_WINDOW_DAYS } from "@/lib/readiness/evidence-standing";
import { sumProgress, type EvidenceProgress } from "@/lib/readiness/evidence-scope";
import type { EvidenceOverviewRow } from "@/lib/dashboard/evidence-overview";
import { tryAdminClient } from "@/lib/supabase/admin-guard";

type SupabaseLike = { from: (table: string) => any };

/**
 * The exporter's and supplier's dashboard, in the importer dashboard's layout,
 * section for section:
 *
 *   Importer                         Exporter / supplier (this)
 *   Header + "Product status"        Header + "Products"
 *   Product Status (count cards)     Product Status (the same cards, counting
 *                                    what they owe — evidence-standing.ts)
 *   Required evidence, by level      Required evidence: company, facilities,
 *     (exporters, facilities,          products — the same card
 *      products)                       (EvidenceOverviewCard)
 *   Deadlines and reviews            Deadlines and reviews: documents sent back,
 *                                    expiring documents, corrective actions to
 *                                    answer, importers' records needing them
 *
 * The same components where the content is the same; the exporter's own
 * content where it is not. Getting started appears only until there is a
 * facility and a product.
 */
export async function ExporterDashboard({
  supplierId,
  companyName,
  displayName,
  supabase,
  variant = "exporter",
}: {
  supplierId: string | null;
  companyName: string | null;
  displayName: string;
  supabase: SupabaseLike;
  /**
   * "manufacturer" for a supplier further up the chain: the same dashboard, but
   * it counts the exporters buying from it rather than its own upstream vendors.
   */
  variant?: "exporter" | "manufacturer";
}) {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + DOCUMENT_EXPIRY_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  const [facilitiesRes, productsRes, linksRes, returnedRes, expiringRes, recordsRes] = await Promise.all([
    supplierId
      ? (supabase.from("facilities_verify") as any).select("id").eq("supplier_id", supplierId)
      : Promise.resolve({ data: [] }),
    supplierId
      ? (supabase.from("products_verify") as any).select("id").eq("supplier_id", supplierId)
      : Promise.resolve({ data: [] }),
    // An exporter's upstream vendors, or a manufacturer's exporters.
    supplierId
      ? (supabase.from("supplier_relationships") as any)
          .select("id")
          .eq("relationship_type", "exporter_supplier")
          .eq(variant === "manufacturer" ? "supplier_id" : "exporter_id", supplierId)
          .eq("status", "active")
      : Promise.resolve({ data: [] }),
    supplierId
      ? (supabase.from("documents") as any)
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", supplierId)
          .in("evidence_status", ["needs_revision", "rejected"])
          .is("soft_deleted_at", null)
      : Promise.resolve({ count: 0 }),
    supplierId
      ? (supabase.from("documents") as any)
          .select("id, title, expiration_date")
          .eq("supplier_id", supplierId)
          .eq("evidence_status", "accepted")
          .is("soft_deleted_at", null)
          .not("expiration_date", "is", null)
          .lte("expiration_date", horizon)
          .order("expiration_date")
          .limit(10)
      : Promise.resolve({ data: [] }),
    supplierId
      ? (supabase.from("fsvp_records") as any)
          .select("id, status, reassessment_due_at, importer_id, products_verify(product_name)")
          .eq("supplier_id", supplierId)
          .in("status", ["needs_corrective_action", "rejected", "reassessment_due", "expired"])
      : Promise.resolve({ data: [] }),
  ]);

  const facilityIds = ((facilitiesRes.data ?? []) as Array<{ id: string }>).map((f) => f.id);
  const productIds = ((productsRes.data ?? []) as Array<{ id: string }>).map((p) => p.id);
  const linkCount = ((linksRes.data ?? []) as unknown[]).length;
  const returnedCount = (returnedRes as { count?: number | null }).count ?? 0;
  const expiring = (expiringRes.data ?? []) as Array<{ id: string; title: string; expiration_date: string }>;

  // Required documents at each level, as the importer's card counts them.
  const empty = () => new Map<string, EvidenceProgress>();
  const [companyProgress, facilityProgress, productProgress] = await Promise.all([
    supplierId ? fetchEvidenceProgress(supabase, "supplier", [supplierId], { importerId: null }).catch(empty) : empty(),
    fetchEvidenceProgress(supabase, "facility", facilityIds, { importerId: null }).catch(empty),
    fetchEvidenceProgress(supabase, "product", productIds, { importerId: null }).catch(empty),
  ]);
  const counts = countEvidenceStandings(productIds.map((id) => productProgress.get(id)));
  const evidenceRows: EvidenceOverviewRow[] = [
    { label: "Your company", entityCount: supplierId ? 1 : 0, entityNoun: ["company", "companies"], href: "/corporate#documents", progress: sumProgress(companyProgress.values()) },
    { label: "Facilities", entityCount: facilityIds.length, entityNoun: ["facility", "facilities"], href: "/facilities", progress: sumProgress(facilityProgress.values()) },
    { label: "Products", entityCount: productIds.length, entityNoun: ["product", "products"], href: "/products", progress: sumProgress(productProgress.values()) },
  ];

  // Corrective actions and importer names through the admin client, scoped by
  // hand to this company: RLS admits neither to an exporter's session.
  const adminResult = tryAdminClient();
  const rawRecords = (recordsRes.data ?? []) as Array<{
    id: string; status: string; reassessment_due_at: string | null; importer_id: string;
    products_verify: { product_name: string } | null;
  }>;
  const [{ data: actionRows }, { data: importerRows }] = adminResult.ok && supplierId
    ? await Promise.all([
        (adminResult.client.from("corrective_actions") as any)
          .select("id, issue_description, triggered_at, supplier_response, importers(display_name), products_verify(product_name)")
          .eq("supplier_id", supplierId)
          .neq("status", "closed")
          .order("triggered_at", { ascending: false }),
        rawRecords.length
          ? (adminResult.client.from("importers") as any)
              .select("id, display_name")
              .in("id", [...new Set(rawRecords.map((r) => r.importer_id))])
          : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }];
  const actions = (actionRows ?? []) as Array<{
    id: string; issue_description: string; triggered_at: string; supplier_response: string | null;
    importers: { display_name: string | null } | null; products_verify: { product_name: string } | null;
  }>;
  const importerName = new Map(
    ((importerRows ?? []) as Array<{ id: string; display_name: string | null }>).map((i) => [i.id, i.display_name])
  );

  const recordProblem: Record<string, string> = {
    needs_corrective_action: "needs corrective action",
    rejected: "was rejected",
    reassessment_due: "is due for reassessment",
    expired: "has expired",
  };

  const gettingStarted = facilityIds.length === 0 || productIds.length === 0;
  const nothingDue = returnedCount === 0 && expiring.length === 0 && actions.length === 0 && rawRecords.length === 0;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">{companyName ?? displayName}</h1>
            <p className="mt-1 text-sm text-slate-500">Welcome back, {displayName}</p>
          </div>
          <Link
            href="/products"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
          >
            <Package className="h-4 w-4" />
            Product status
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {gettingStarted && (
        <section className="rounded-lg border border-forest/30 bg-white p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-ink">Getting started</h2>
          <p className="mt-1 text-sm text-slate-500">
            Your importers can only ask for documents once your sites and products exist. This goes away once they do.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: "Add a facility", href: "/facilities", done: facilityIds.length > 0 },
              { label: "Add a product", href: "/products", done: productIds.length > 0 },
            ].map((step) => (
              <Link
                key={step.label}
                href={step.href}
                className={`inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-semibold transition ${
                  step.done ? "border border-line text-slate-400 line-through" : "bg-forest text-white hover:bg-[#195f4d]"
                }`}
              >
                {step.done ? <CheckCircle2 className="h-4 w-4" /> : null}
                {step.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Product Status</h2>
        <p className="mt-1 text-sm text-slate-500">
          {productIds.length === 0
            ? "No products yet. Your importers ask for documents product by product."
            : "Every product you supply, by what it still needs from you. Each count opens those products."}
        </p>
        <div className="mt-4">
          <ExporterCountCards counts={counts} />
        </div>
        <p className="mt-3 border-t border-line pt-3 text-xs text-slate-500">
          <Link href="/facilities" className="font-semibold text-forest hover:underline">
            {facilityIds.length} facilit{facilityIds.length === 1 ? "y" : "ies"}
          </Link>
          {variant === "exporter" ? (
            linkCount > 0 && (
              <>
                {" · "}
                <Link href="/my-suppliers" className="font-semibold text-forest hover:underline">
                  {linkCount} upstream vendor{linkCount === 1 ? "" : "s"}
                </Link>
              </>
            )
          ) : (
            <> · {linkCount} exporter{linkCount === 1 ? "" : "s"} buying from you</>
          )}
        </p>
      </section>

      <EvidenceOverviewCard
        description="Documents your company, each facility and each product owe your importers."
        rows={evidenceRows}
      />

      {nothingDue ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            Nothing needs your attention
          </p>
          <p className="mt-0.5 text-sm text-emerald-800">
            Nothing sent back, nothing expiring in the next {DOCUMENT_EXPIRY_WINDOW_DAYS} days, and no corrective action waiting on you.
          </p>
        </div>
      ) : (
        <DeadlinesSection>
          {returnedCount > 0 && (
            <DeadlineRow
              icon={<AlertCircle className="h-4 w-4" />}
              tone="text-red-500"
              title={`${returnedCount} document${returnedCount === 1 ? "" : "s"} sent back to you`}
              detail="Your importer asked for a revision or rejected it — the note says why"
              href="/my-evidence?status=returned"
              cta="Fix"
            />
          )}

          {actions.map((a) => (
            <DeadlineRow
              key={`ca-${a.id}`}
              icon={<FileWarning className="h-4 w-4" />}
              tone="text-red-400"
              title={a.issue_description}
              detail={`Corrective action from ${a.importers?.display_name ?? "your importer"} · ${
                a.products_verify?.product_name ?? "all your products for them"
              } · open since ${new Date(a.triggered_at).toLocaleDateString()}`}
            >
              <SupplierResponseForm actionId={a.id} current={a.supplier_response} />
            </DeadlineRow>
          ))}

          {rawRecords.map((r) => (
            <DeadlineRow
              key={`rec-${r.id}`}
              icon={<ShieldAlert className="h-4 w-4" />}
              tone="text-amber-500"
              title={`${r.products_verify?.product_name ?? "A product"} ${recordProblem[r.status] ?? "needs attention"}`}
              detail={`${importerName.get(r.importer_id) ?? "Your importer"}'s FSVP record${
                r.reassessment_due_at ? ` · due ${new Date(r.reassessment_due_at).toLocaleDateString()}` : ""
              } — they may ask you for updated documents`}
              href="/products"
              cta="Open"
            />
          ))}

          {expiring.map((d) => {
            const lapsed = d.expiration_date.slice(0, 10) < today;
            const days = Math.ceil((new Date(d.expiration_date).getTime() - Date.now()) / 86_400_000);
            return (
              <DeadlineRow
                key={`ex-${d.id}`}
                icon={<Clock className="h-4 w-4" />}
                tone={lapsed || days <= 30 ? "text-red-500" : "text-amber-400"}
                title={`Expiring: ${d.title}`}
                detail={lapsed
                  ? `Expired ${new Date(d.expiration_date).toLocaleDateString()} — upload a current version`
                  : `${days} day${days === 1 ? "" : "s"} left · upload a current version`}
                href="/my-evidence?status=expiring"
                cta="Replace"
              />
            );
          })}
        </DeadlinesSection>
      )}
    </div>
  );
}
