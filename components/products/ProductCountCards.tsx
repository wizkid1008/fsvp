import Link from "next/link";

/**
 * The product counts, as the Dashboard and the Products page both show them.
 *
 * They used to be two different sets — the Dashboard counted approved
 * exporters, facilities and products and blocked products; Products counted
 * added, approved and blocked — so the two screens a user checks first gave
 * different numbers, and only one of them could say "do not ship". One
 * component, so they cannot drift apart again.
 *
 * Each count links to the Products list filtered to exactly those products
 * (ProductTable reads ?status=). No "Active" badge: it said only that the
 * number was above zero, which the number already says.
 *
 * No "use client": rendered on the server by the Dashboard and inside the
 * client provider on Products.
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
  /** While the counts load, or if they failed: "…" or "—" in each card. */
  placeholder,
}: {
  counts: ProductCounts | null;
  placeholder?: string;
}) {
  const cards: Array<{ label: string; key: keyof ProductCounts; status: string; alarm?: boolean }> = [
    { label: "Imported products", key: "total", status: "" },
    { label: "Something left to do", key: "needsAction", status: "needs_action" },
    { label: "Approved", key: "approved", status: "approved" },
    { label: "Blocked", key: "blocked", status: "blocked", alarm: true },
    { label: "Do not ship", key: "doNotShip", status: "do_not_ship", alarm: true },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => {
        const value = counts ? counts[card.key] : null;
        const alarming = card.alarm && (value ?? 0) > 0;
        return (
          <Link
            key={card.key}
            href={card.status ? `/products?status=${card.status}` : "/products"}
            className={`rounded-lg border bg-white p-4 shadow-soft transition hover:border-forest ${
              alarming ? "border-red-200" : "border-line"
            }`}
          >
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${alarming ? "text-red-700" : "text-ink"}`}>
              {value ?? placeholder ?? "…"}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
