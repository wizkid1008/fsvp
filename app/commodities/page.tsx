import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { commodityWorkflows, moduleConfigs } from "@/data/platform";

export default function CommoditiesPage() {
  return (
    <AppShell>
      <SectionHeader title={moduleConfigs.commodities.title} description={moduleConfigs.commodities.description} action={moduleConfigs.commodities.primaryAction} />
      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {commodityWorkflows.map((workflow) => (
          <article key={workflow.commodity} className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">{workflow.commodity}</h2>
              <StatusBadge tone={workflow.likelyRisks.length >= 4 ? "danger" : "warning"}>{workflow.likelyRisks.length} risks</StatusBadge>
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-700">Likely risk categories</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{workflow.likelyRisks.join(", ")}</p>
            <p className="mt-4 text-sm font-semibold text-slate-700">Required verification evidence</p>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
              {workflow.requiredEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm font-semibold text-slate-700">Verification activities</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{workflow.verificationActivities.join(", ")}</p>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
