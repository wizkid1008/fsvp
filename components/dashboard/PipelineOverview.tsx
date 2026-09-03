import { ClipboardCheck, FileCheck2, Package, ShieldCheck } from "lucide-react";
import type { ProductSummary } from "@/lib/dashboard/product-journey";
import type { SetupSummary } from "@/lib/setup/fsvp-workflow";
import type { WorkGate } from "@/lib/dashboard/outstanding-work";

function gateCount(gates: WorkGate[], id: string) {
  return gates.find((gate) => gate.id === id)?.count ?? 0;
}

export function PipelineOverview({
  productSummary,
  setupSummary,
  gates,
}: {
  productSummary: ProductSummary;
  setupSummary: SetupSummary;
  gates: WorkGate[];
}) {
  const awaitingApproval = gateCount(gates, "approval");
  const recordsOpen = setupSummary.records;
  const products = setupSummary.products;
  const approved = productSummary.approved;
  const steps = [
    {
      label: "Products",
      value: products,
      detail: "active foods",
      icon: Package,
    },
    {
      label: "Records open",
      value: recordsOpen,
      detail: "FSVP records",
      icon: FileCheck2,
    },
    {
      label: "Awaiting approval",
      value: awaitingApproval,
      detail: "records",
      icon: ClipboardCheck,
    },
    {
      label: "Approved",
      value: approved,
      detail: "importable products",
      icon: ShieldCheck,
    },
  ];

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Pipeline Overview</h2>
          <p className="mt-1 text-sm text-slate-500">
            A compact count of how work is moving from product setup to approval.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="rounded-md border border-line bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Icon className="h-3.5 w-3.5 text-forest" />
                {step.label}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-2xl font-semibold text-ink">{step.value}</p>
                <p className="text-xs font-medium text-slate-500">{step.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
