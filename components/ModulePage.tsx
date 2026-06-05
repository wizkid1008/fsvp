import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import type { ModuleConfig } from "@/types/platform";

export function ModulePage({ config }: { config: ModuleConfig }) {
  return (
    <AppShell>
      <SectionHeader title={config.title} description={config.description} action={config.primaryAction} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-line bg-white shadow-soft">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-base font-semibold text-ink">Current Records</h2>
          </div>
          <div className="px-5 py-10 text-center">
            <p className="text-base font-semibold text-ink">No Supabase records yet</p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
              This workspace is connected to Supabase. Records for this module will appear here after they are created
              or imported for your account.
            </p>
          </div>
        </section>
        <aside className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h2 className="text-base font-semibold text-ink">Operational Checklist</h2>
          <div className="mt-4 space-y-3">
            {config.checklist.map((item) => (
              <label key={item} className="flex items-start gap-3 rounded-md border border-line p-3 text-sm text-slate-700">
                <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-forest" />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
