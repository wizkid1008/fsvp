import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { moduleConfigs } from "@/data/platform";

export default function RequirementsPage() {
  return (
    <AppShell>
      <SectionHeader title={moduleConfigs.requirements.title} description={moduleConfigs.requirements.description} action={moduleConfigs.requirements.primaryAction} />
      <section className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
        <div className="grid grid-cols-[1.1fr_1fr_160px_1fr] gap-4 border-b border-line bg-slate-50 px-5 py-3 text-xs font-semibold uppercase text-slate-500">
          <span>Requirement</span>
          <span>Evidence</span>
          <span>Status</span>
          <span>Determination</span>
        </div>
        <div className="px-5 py-12 text-center">
          <StatusBadge tone="neutral">No records</StatusBadge>
          <p className="mt-4 text-base font-semibold text-ink">No requirement mappings yet</p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Requirement rows will populate from Supabase after suppliers, products, uploaded evidence, reviewer notes,
            corrective actions, and final determinations are created for your workspace.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
