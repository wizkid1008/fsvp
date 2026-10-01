import { CountCards } from "@/components/ui/CountCards";
import type { EvidenceCounts } from "@/lib/readiness/evidence-standing";

/**
 * The importer's product counts, as the Dashboard and the Products page both
 * show them.
 *
 * They used to be two different sets — the Dashboard counted approved
 * exporters, facilities and products and blocked products; Products counted
 * added, approved and blocked — so the two screens a user checks first gave
 * different numbers, and only one of them could say "do not ship". One
 * component, so they cannot drift apart again. Each count opens the Products
 * list filtered to exactly those products (ProductTable reads ?status=).
 */

export type ProductCounts = {
  total: number;
  needsAction: number;
  approved: number;
  blocked: number;
  doNotShip: number;
};

export function ProductCountCards({
  counts,
  placeholder,
}: {
  counts: ProductCounts | null;
  /** While the counts load, or if they failed: "…" or "—" in each card. */
  placeholder?: string;
}) {
  return (
    <CountCards
      placeholder={placeholder}
      cards={[
        { label: "Imported products", value: counts?.total ?? null, href: "/products" },
        { label: "Something left to do", value: counts?.needsAction ?? null, href: "/products?status=needs_action" },
        { label: "Approved", value: counts?.approved ?? null, href: "/products?status=approved" },
        { label: "Blocked", value: counts?.blocked ?? null, href: "/products?status=blocked", alarm: true },
        { label: "Do not ship", value: counts?.doNotShip ?? null, href: "/products?status=do_not_ship", alarm: true },
      ]}
    />
  );
}

/**
 * The exporter's counterpart: the same cards, counting what the exporter owes
 * instead of the importer's FSVP gates (see lib/readiness/evidence-standing.ts).
 * Each opens their Products list filtered to exactly those products.
 */
export function ExporterCountCards({
  counts,
  basePath = "/products",
  noun = "Products",
}: {
  counts: EvidenceCounts;
  /** The list each count opens, filtered: /products, or /facilities for a supplier's sites. */
  basePath?: string;
  noun?: string;
}) {
  return (
    <CountCards
      cards={[
        { label: noun, value: counts.total, href: basePath },
        { label: "Sent back to you", value: counts.returned, href: `${basePath}?status=returned`, alarm: true },
        { label: "Documents missing", value: counts.missing, href: `${basePath}?status=missing` },
        { label: "Awaiting importer review", value: counts.awaiting, href: `${basePath}?status=awaiting` },
        { label: "All accepted", value: counts.complete, href: `${basePath}?status=complete` },
      ]}
    />
  );
}
