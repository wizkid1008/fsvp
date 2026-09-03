import { AlertTriangle, Building2, PackageCheck, ShipWheel } from "lucide-react";
import type { ProductSummary } from "@/lib/dashboard/product-journey";

/**
 * A compact approval snapshot for the importer dashboard.
 * The detailed gate list below owns "what still needs doing"; this card answers
 * the simpler executive question: how many products, facilities, and exporters
 * are approved right now.
 */

function totalLabel(total: number, unit: string, plural = `${unit}s`) {
  return `of ${total} ${total === 1 ? unit : plural}`;
}

export function ProgramStatus({
  summary,
  supplyChain,
}: {
  summary: ProductSummary;
  supplyChain: {
    exporters: number;
    approvedExporters: number;
    facilities: number;
    approvedFacilities: number;
  };
}) {
  const { total, blocked, approved } = summary;
  const metrics = [
    {
      label: "Approved products",
      value: approved,
      detail: totalLabel(total, "product"),
      icon: PackageCheck,
      tone: "text-emerald-700",
    },
    {
      label: "Approved facilities",
      value: supplyChain.approvedFacilities,
      detail: totalLabel(supplyChain.facilities, "facility", "facilities"),
      icon: Building2,
      tone: "text-emerald-700",
    },
    {
      label: "Approved exporters",
      value: supplyChain.approvedExporters,
      detail: totalLabel(supplyChain.exporters, "exporter"),
      icon: ShipWheel,
      tone: "text-emerald-700",
    },
    {
      label: "Blocked products",
      value: blocked,
      detail: totalLabel(total, "product"),
      icon: AlertTriangle,
      tone: blocked > 0 ? "text-red-700" : "text-slate-500",
    },
  ];

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Product Status</h2>
          <p className="mt-1 text-sm text-slate-500">
            {total === 0
              ? "No products yet. Every FSVP obligation is measured against the food you import."
              : "Approved supply-chain coverage and products blocked from import."}
          </p>
        </div>
        {blocked > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {blocked} blocked
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-md border border-line bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Icon className={`h-3.5 w-3.5 ${metric.tone}`} />
                {metric.label}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-3xl font-semibold text-ink">{metric.value}</p>
                <p className="text-xs font-medium text-slate-500">{metric.detail}</p>
              </div>
            </div>
          );
        })}
      </div>

      {blocked > 0 && (
        <p className="mt-3 border-t border-line pt-3 text-xs text-slate-500">
          {blocked} product{blocked === 1 ? " is" : "s are"} blocked and not included in the approved count.
        </p>
      )}
    </section>
  );
}
