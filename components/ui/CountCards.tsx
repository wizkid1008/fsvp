import Link from "next/link";

/**
 * A row of counts, each opening the list of exactly what it counts.
 *
 * The importer's product counts (ProductCountCards) and the exporter's
 * (ExporterCountCards) are both this, so the two sides of the platform read
 * the same way: a number, what it counts, and a click to those items. No
 * "Active" badge — it only restated that the number was above zero. A count
 * that signals a problem turns red.
 *
 * No "use client": rendered on the server and inside client providers.
 */
export type CountCard = {
  label: string;
  value: number | null;
  href: string;
  /** Red when above zero. */
  alarm?: boolean;
};

export function CountCards({ cards, placeholder = "…" }: { cards: CountCard[]; placeholder?: string }) {
  const cols =
    cards.length >= 5 ? "lg:grid-cols-5" : cards.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";
  return (
    <div className={`grid gap-3 sm:grid-cols-3 ${cols}`}>
      {cards.map((card) => {
        const alarming = card.alarm && (card.value ?? 0) > 0;
        return (
          <Link
            key={card.label}
            href={card.href}
            className={`rounded-lg border bg-white p-4 shadow-soft transition hover:border-forest ${
              alarming ? "border-red-200" : "border-line"
            }`}
          >
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className={`mt-2 text-3xl font-semibold ${alarming ? "text-red-700" : "text-ink"}`}>
              {card.value ?? placeholder}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
