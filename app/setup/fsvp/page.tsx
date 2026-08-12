import Link from "next/link";
import { CheckCircle2, Circle, CircleAlert, FileArchive, FolderCheck, PackageSearch, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfigurationNotice } from "@/components/ui/ConfigurationNotice";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { loadCompleteFsvpSetupPlan, type SetupStep } from "@/lib/setup/fsvp-workflow";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function stepTone(step: SetupStep): StatusTone {
  return step.blockers.length === 0 ? "success" : "warning";
}

function stepLabel(step: SetupStep): string {
  return step.blockers.length === 0 ? "Complete" : `${step.blockers.length} blocker${step.blockers.length === 1 ? "" : "s"}`;
}

export default async function CompleteFsvpSetupPage() {
  const { role, realRole, user } = await requireProfileRole("/setup/fsvp", [
    "us_importer",
    "administrator",
  ]);
  const supabase = createServerSupabaseClient();
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const importerId = resolvePreviewedAccountId(realRole, profile?.importer_id ?? null);
  const adminResult = tryAdminClient();

  if (!adminResult.ok) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader
          title="Complete FSVP Setup"
          description="Follow the importer workflow from exporter setup through the inspection package."
        />
        <ConfigurationNotice message={adminResult.message} />
      </AppShell>
    );
  }

  if (!importerId) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader
          title="Complete FSVP Setup"
          description="Follow the importer workflow from exporter setup through the inspection package."
        />
        <div className="mt-6 rounded-lg border border-line bg-white px-6 py-10 text-center">
          <p className="text-sm text-slate-600">Your account is not linked to an importing organization yet.</p>
        </div>
      </AppShell>
    );
  }

  const plan = await loadCompleteFsvpSetupPlan(adminResult.client as any, importerId);
  const completeSteps = plan.steps.filter((step) => step.blockers.length === 0).length;
  const totalBlockers = plan.steps.reduce((sum, step) => sum + step.blockers.length, 0);
  const progress = plan.steps.length === 0
    ? 0
    : Math.round((completeSteps / plan.steps.length) * 100);

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Complete FSVP Setup"
        description="A guided path from exporter setup to an audit-ready FSVP inspection package. Each open item links to the screen that clears it."
      />

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {[
          { label: "Workflow Progress", value: `${progress}%`, tone: totalBlockers === 0 ? "success" as StatusTone : "warning" as StatusTone, icon: CheckCircle2 },
          { label: "Open Blockers", value: String(totalBlockers), tone: totalBlockers === 0 ? "success" as StatusTone : "danger" as StatusTone, icon: CircleAlert },
          { label: "FSVP Records", value: String(plan.summary.records), tone: plan.summary.records > 0 ? "info" as StatusTone : "neutral" as StatusTone, icon: FolderCheck },
          { label: "Packages", value: String(plan.summary.packages), tone: plan.summary.packages > 0 ? "success" as StatusTone : "neutral" as StatusTone, icon: FileArchive },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-lg border border-line bg-white p-4 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-slate-500">{metric.label}</p>
                <Icon className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-2xl font-semibold text-ink">{metric.value}</p>
                <StatusBadge tone={metric.tone}>{metric.value === "0" ? "None" : "Active"}</StatusBadge>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-lg border border-line bg-white shadow-soft">
        <div className="border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">Setup Path</h2>
              <p className="mt-1 text-sm text-slate-500">
                {completeSteps} of {plan.steps.length} steps complete.
              </p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 md:w-64">
              <div className="h-full rounded-full bg-forest" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <div className="divide-y divide-line">
          {plan.steps.map((step, index) => {
            const complete = step.blockers.length === 0;
            const Icon = complete ? CheckCircle2 : Circle;
            return (
              <section key={step.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[260px_1fr]">
                <div className="flex gap-3">
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                    complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Step {index + 1}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusBadge tone={stepTone(step)}>{stepLabel(step)}</StatusBadge>
                      <Link href={step.href} className="text-sm font-semibold text-forest hover:underline">
                        {step.actionLabel}
                      </Link>
                    </div>
                  </div>
                </div>

                {complete ? (
                  <div className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    No blockers found for this step.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {step.blockers.map((item) => (
                      <div key={item.id} className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex gap-2">
                          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                          <p className="text-sm leading-6 text-amber-950">{item.message}</p>
                        </div>
                        <Link
                          href={item.href}
                          className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                        >
                          <PackageSearch className="h-3.5 w-3.5" />
                          {item.actionLabel}
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
