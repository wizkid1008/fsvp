import { AppShell } from "@/components/layout/AppShell";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { dashboardMetrics, readinessCategories } from "@/data/platform";
import { formatPercent } from "@/lib/utils";

export default function DashboardPage() {
  return (
    <AppShell>
      <SectionHeader
        title="Dashboard"
        description="A command center for supplier readiness, document review, compliance gaps, reminders, and upcoming FSVP work."
        action="Submit for review"
      />
      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardMetrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} detail={metric.detail} tone={metric.tone} />
        ))}
      </section>
      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">Readiness Categories</h2>
            <StatusBadge tone="info">Assessment</StatusBadge>
          </div>
          <div className="mt-5 space-y-4">
            {readinessCategories.map((category) => (
              <div key={category.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{category.label}</span>
                  <span className="text-slate-500">{formatPercent(category.score)}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-forest" style={{ width: `${category.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <aside className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h2 className="text-base font-semibold text-ink">Next Actions</h2>
          <div className="mt-4 space-y-3">
            {[
              "Upload latest mock recall evidence",
              "Resolve HACCP plan review note",
              "Renew GMP certification before expiry",
              "Generate supplier readiness report"
            ].map((item) => (
              <div key={item} className="rounded-md border border-line p-3 text-sm text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </aside>
      </section>
    </AppShell>
  );
}
