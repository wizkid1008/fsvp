import Link from "next/link";
import { ProductCountCards, type ProductCounts } from "@/components/products/ProductCountCards";

/**
 * The importer dashboard's product snapshot.
 *
 * It used to count approved exporters, approved facilities, approved products
 * and blocked products — a different set from the Products page beside it, and
 * with no "do not ship". The product counts are now ProductCountCards, the
 * same component and the same numbers as Products, each linking to the list
 * filtered to those products. Exporter and facility approval, which only this
 * screen showed, stays as one line beneath.
 */
export function ProgramStatus({
  counts,
  supplyChain,
}: {
  counts: ProductCounts;
  supplyChain: {
    exporters: number;
    approvedExporters: number;
    facilities: number;
    approvedFacilities: number;
  };
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <h2 className="text-sm font-semibold text-ink">Product Status</h2>
      <p className="mt-1 text-sm text-slate-500">
        {counts.total === 0
          ? "No products yet. Every FSVP obligation is measured against the food you import."
          : "Every food you import, by where it stands. Each count opens those products."}
      </p>
      <div className="mt-4">
        <ProductCountCards counts={counts} />
      </div>
      <p className="mt-3 border-t border-line pt-3 text-xs text-slate-500">
        <Link href="/exporters" className="font-semibold text-forest hover:underline">
          {supplyChain.approvedExporters} of {supplyChain.exporters} exporters
        </Link>{" "}
        and{" "}
        <Link href="/facilities" className="font-semibold text-forest hover:underline">
          {supplyChain.approvedFacilities} of {supplyChain.facilities} facilities
        </Link>{" "}
        approved.
      </p>
    </section>
  );
}
