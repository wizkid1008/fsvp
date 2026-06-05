import { AppShell } from "@/components/layout/AppShell";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { dashboardMetrics, readinessCategories, riskSignals } from "@/data/platform";
import { APP_SUBTITLE } from "@/lib/constants";

export default function DashboardPage() {
  const overallScore = readinessCategories.reduce((total, item) => total + item.score, 0);

  return (
    <AppShell>
      <SectionHeader
        title="Risk Dashboard"
        description={`${APP_SUBTITLE}. Prioritize supplier/product pairs by commodity risk, missing evidence, expiring certificates, corrective actions, and final readiness status.`}
        action="Start Supplier Review"
      />
      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardMetrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} detail={metric.detail} tone={metric.tone} />
        ))}
      </section>
      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">Weighted Readiness Score</h2>
            <StatusBadge tone="warning">{overallScore}/100</StatusBadge>
          </div>
          <div className="mt-5 space-y-4">
            {readinessCategories.map((category) => (
              <div key={category.category}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{category.category}</span>
                  <span className="text-slate-500">{category.score}/{category.weight}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-forest" style={{ width: `${(category.score / category.weight) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{category.nextAction}</p>
              </div>
            ))}
          </div>
        </div>
        <aside className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h2 className="text-base font-semibold text-ink">Supplier Risk Queue</h2>
          <div className="mt-4 space-y-3">
            {riskSignals.map((item) => (
              <div key={`${item.supplier}-${item.commodity}`} className="rounded-md border border-line p-3 text-sm text-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{item.supplier}</p>
                    <p className="text-xs text-slate-500">{item.commodity} • {item.country}</p>
                  </div>
                  <StatusBadge tone={item.riskLevel === "critical" ? "danger" : item.riskLevel === "high" ? "warning" : "info"}>{item.score}</StatusBadge>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-600">{item.readinessStatus}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{item.blockers.join("; ")}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
