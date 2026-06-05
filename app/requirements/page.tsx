import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fsvpRequirements, moduleConfigs } from "@/data/platform";

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
        <div className="divide-y divide-line">
          {fsvpRequirements.map((requirement) => (
            <article key={requirement.name} className="grid gap-4 px-5 py-4 md:grid-cols-[1.1fr_1fr_160px_1fr]">
              <div>
                <h2 className="text-sm font-semibold text-ink">{requirement.name}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">{requirement.description}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">{requirement.requiredEvidence}</p>
                <p className="mt-1 text-sm text-slate-500">Uploaded: {requirement.uploadedEvidence}</p>
              </div>
              <div className="space-y-2">
                <StatusBadge tone={requirement.gapStatus.includes("Critical") ? "danger" : requirement.gapStatus.includes("Complete") ? "success" : "warning"}>
                  {requirement.reviewerStatus}
                </StatusBadge>
                <p className="text-xs text-slate-500">{requirement.gapStatus}</p>
              </div>
              <div>
                <p className="text-sm leading-6 text-slate-600">{requirement.finalDetermination}</p>
                <p className="mt-1 text-xs text-slate-500">Action: {requirement.correctiveAction}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
