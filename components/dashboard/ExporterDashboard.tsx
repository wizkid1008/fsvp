import Link from "next/link";
import { CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { ActionItemsSection } from "./ActionItemsSection";
import { FsvpProcessFlow, type FsvpProcessRecord } from "./FsvpProcessFlow";
import { ExporterCountCards } from "@/components/products/ProductCountCards";
import { computeSupplierReadiness } from "@/lib/readiness/supplier-score";
import { fetchEvidenceProgress } from "@/lib/readiness/evidence-progress";
import { countEvidenceStandings } from "@/lib/readiness/evidence-standing";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import type { EvidenceProgress } from "@/lib/readiness/evidence-scope";

type SupabaseLike = { from: (table: string) => any };

/**
 * The exporter's dashboard, laid out like the importer's.
 *
 * The importer's reads: who you are, then counts that each open exactly those
 * products, then what needs you. This was a readiness percentage, a fixed
 * four-step checklist and four tiles — and the checklist could never finish,
 * because its company-documents query filtered on a column that does not
 * exist. Now:
 *
 *   1. A one-line answer to "is anything waiting on me?" — which used to read
 *      "Setup complete — awaiting importer review" even with documents sent
 *      back.
 *   2. The product counts (ExporterCountCards), the same component and format
 *      as the importer's, counting what the exporter owes.
 *   3. Company documents, as Company Overview counts them.
 *   4. Getting started — only until there is a facility and a product.
 *   5. Corrective actions to answer, and the importers' FSVP records naming
 *      this exporter, with each importer's name.
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
  const [facilitiesRes, productsRes, upstreamRes, readiness, fsvpRecordsRes] = await Promise.all([
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
    computeSupplierReadiness(supabase, supplierId),
    supplierId
      ? (supabase.from("fsvp_records") as any)
          .select("id, status, reassessment_due_at, importer_id, facilities_verify(facility_name), products_verify(product_name)")
          .eq("supplier_id", supplierId)
      : Promise.resolve({ data: [] }),
  ]);

  const facilities = (facilitiesRes.data ?? []) as Array<{ id: string }>;
  const products = (productsRes.data ?? []) as Array<{ id: string }>;
  const upstreamCount = ((upstreamRes.data ?? []) as unknown[]).length;

  // Per product, what is owed — the same counts the Products list shows.
  const progressByProduct = await fetchEvidenceProgress(
    supabase,
    "product",
    products.map((p) => p.id),
    { importerId: null }
  ).catch(() => new Map<string, EvidenceProgress>());
  const counts = countEvidenceStandings(products.map((p) => progressByProduct.get(p.id)));

  // Importer names for the FSVP record cards. The exporter's session cannot
  // read importers, so the names come through the admin client, for exactly
  // the importers whose records name this exporter.
  const rawRecords = (fsvpRecordsRes.data ?? []) as Array<{
    id: string;
    status: FsvpProcessRecord["status"];
    reassessment_due_at: string | null;
    importer_id: string;
    facilities_verify: { facility_name: string } | null;
    products_verify: { product_name: string } | null;
  }>;
  const importerIds = [...new Set(rawRecords.map((r) => r.importer_id))];
  const adminResult = tryAdminClient();
  const { data: importerRows } = adminResult.ok && importerIds.length
    ? await (adminResult.client.from("importers") as any).select("id, display_name").in("id", importerIds)
    : { data: [] };
  const importerName = new Map(
    ((importerRows ?? []) as Array<{ id: string; display_name: string | null }>).map((i) => [i.id, i.display_name])
  );
  const fsvpRecords: FsvpProcessRecord[] = rawRecords.map((r) => ({
    id: r.id,
    status: r.status,
    reassessment_due_at: r.reassessment_due_at,
    facility_name: r.facilities_verify?.facility_name ?? null,
    product_name: r.products_verify?.product_name ?? null,
    importer_name: importerName.get(r.importer_id) ?? null,
  }));

  const gettingStarted = facilities.length === 0 || products.length === 0;
  const steps = [
    { key: "facility", label: "Add a facility", href: "/facilities", done: facilities.length > 0 },
    { key: "product", label: "Add a product", href: "/products", done: products.length > 0 },
    { key: "documents", label: "Upload your company documents", href: "/corporate#documents", done: readiness.acceptedCount > 0 },
  ];

  // The one sentence that answers "is anything waiting on me?".
  const headline =
    counts.returned > 0
      ? { tone: "text-red-700", text: `${counts.returned} product${counts.returned === 1 ? " has" : "s have"} documents sent back to you.` }
      : counts.missing > 0
        ? { tone: "text-amber-700", text: `${counts.missing} product${counts.missing === 1 ? " is" : "s are"} missing documents.` }
        : counts.awaiting > 0
          ? { tone: "text-slate-600", text: `Everything is in. ${counts.awaiting} product${counts.awaiting === 1 ? " is" : "s are"} awaiting your importer's review.` }
          : products.length > 0
            ? { tone: "text-emerald-700", text: "Every product's documents are accepted." }
            : { tone: "text-slate-600", text: "Add a facility and a product to get started." };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <h1 className="text-xl font-semibold text-ink">{companyName ?? displayName}</h1>
        <p className="mt-1 text-sm text-slate-500">Welcome back, {displayName}</p>
        <p className={`mt-2 text-sm font-semibold ${headline.tone}`}>{headline.text}</p>
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <h2 className="text-sm font-semibold text-ink">Your products</h2>
        <p className="mt-1 text-sm text-slate-500">
          What each product still needs from you. Each count opens those products.
        </p>
        <div className="mt-4">
          <ExporterCountCards counts={counts} />
        </div>
        <p className="mt-3 border-t border-line pt-3 text-xs text-slate-500">
          <Link href="/corporate#documents" className="font-semibold text-forest hover:underline">
            Company documents: {readiness.acceptedCount} of {readiness.requiredCount} accepted
          </Link>
          {" · "}
          <Link href="/facilities" className="font-semibold text-forest hover:underline">
            {facilities.length} facilit{facilities.length === 1 ? "y" : "ies"}
          </Link>
          {upstreamCount > 0 && variant === "exporter" && (
            <>
              {" · "}
              <Link href="/my-suppliers" className="font-semibold text-forest hover:underline">
                {upstreamCount} upstream vendor{upstreamCount === 1 ? "" : "s"}
              </Link>
            </>
          )}
          {variant === "manufacturer" && (
            <>
              {" · "}
              {upstreamCount} exporter{upstreamCount === 1 ? "" : "s"} buying from you
            </>
          )}
        </p>
      </section>

      {gettingStarted && (
        <section className="rounded-lg border border-forest/30 bg-white shadow-soft">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Getting started</h2>
            <p className="mt-0.5 text-xs text-slate-500">Once these exist, this goes away.</p>
          </div>
          <div className="divide-y divide-line">
            {steps.map((step) => (
              <Link key={step.key} href={step.href} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50">
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

      <ActionItemsSection supplierId={supplierId} />

      <FsvpProcessFlow records={fsvpRecords} />
    </div>
  );
}
