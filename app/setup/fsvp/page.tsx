import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, CircleAlert, PackageSearch, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfigurationNotice } from "@/components/ui/ConfigurationNotice";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { loadCompleteFsvpSetupPlan, type SetupStep } from "@/lib/setup/fsvp-workflow";
import { isOnboardingStep } from "@/lib/setup/fsvp-steps";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

/**
 * Every gate a product and its FSVP record must pass, with what is blocking each.
 *
 * THIS PAGE USED TO CALL ITSELF SETUP, AND SHOW 42% COMPLETE
 *
 * It could not decide what it was: the title said Setup, the first tile said
 * Workflow Progress, the section beneath said Setup Path. Two of those describe
 * something you finish, and eight of the eleven items here never finish.
 * Applicability determinations lapse, compliance screenings expire, a qualified
 * individual's signature goes void the moment the signed text is edited, an
 * approved record returns for reassessment, and an inspection package is
 * generated afresh every time FDA asks. So the percentage had a denominator
 * that grew with every new product and a finish line that does not exist —
 * reach 100%, add one product, fall back.
 *
 * What was always right here is the per-item work: "Cocoa Powder is missing its
 * facility link" with the button that fixes it, and each stage's progress in
 * its own units. That is a work queue, and it is what the page is now.
 */

const PAGE_TITLE = "FSVP Pipeline";
const PAGE_DESCRIPTION =
  "Every gate a product and its FSVP record must pass, and what is blocking each one right now. " +
  "This is not a checklist that finishes — determinations expire, signatures void when signed text " +
  "is edited, and approved records return for reassessment.";

function stepTone(step: SetupStep): StatusTone {
  return step.blockers.length === 0 ? "success" : "warning";
}

function stepLabel(step: SetupStep): string {
  return step.blockers.length === 0
    ? "Clear"
    : `${step.blockers.length} blocker${step.blockers.length === 1 ? "" : "s"}`;
}

/** "3 of 12 products classified" beats a bare "9 blockers" for knowing where you are. */
function stepProgressLabel(step: SetupStep): string {
  return `${step.progress.done} of ${step.progress.total} done`;
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
        <SectionHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
        <ConfigurationNotice message={adminResult.message} />
      </AppShell>
    );
  }

  if (!importerId) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />
        <div className="mt-6 rounded-lg border border-line bg-white px-6 py-10 text-center">
          <p className="text-sm text-slate-600">Your account is not linked to an importing organization yet.</p>
        </div>
      </AppShell>
    );
  }

  const plan = await loadCompleteFsvpSetupPlan(adminResult.client as any, importerId);
  const totalBlockers = plan.steps.reduce((sum, step) => sum + step.blockers.length, 0);
  const blockedStages = plan.steps.filter((step) => step.blockers.length > 0).length;

  // Onboarding is the one part that does finish: until the account holds at
  // least one exporter, facility and product, nothing downstream can happen.
  // Once it does, this prompt never returns — adding a fourth product is not
  // onboarding, and the per-item blockers on those stages stay in the list.
  const onboarding = plan.steps.filter(
    (step) => isOnboardingStep(step.id) && step.progress.total === 0
  );

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader title={PAGE_TITLE} description={PAGE_DESCRIPTION} />

      {onboarding.length > 0 && (
        <section className="mt-6 rounded-lg border border-forest/30 bg-white p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-ink">Start here</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
            Nothing downstream can happen until your account holds one of each. This is the part
            that finishes — once these exist, this prompt does not come back.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {onboarding.map((step) => (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d]"
                >
                  {step.title}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* A count of what is open, not a percentage of what is done. The stages
          below still show their own "4 of 5 done", which is a real ratio in
          real units — it is the whole-plan figure that implied an ending. */}
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-5 py-4 shadow-soft">
        {totalBlockers === 0 ? (
          <>
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-ink">Every stage is clear.</span> Nothing is
              blocking an approval today — determinations and signatures still expire, so this stays
              worth checking.
            </p>
          </>
        ) : (
          <>
            <CircleAlert className="h-5 w-5 shrink-0 text-amber-500" />
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-ink">
                {totalBlockers} open blocker{totalBlockers === 1 ? "" : "s"}
              </span>{" "}
              across {blockedStages} of {plan.steps.length} stage{blockedStages === 1 ? "" : "s"}.
              Each one names the item it is about and links to the screen that clears it.
            </p>
          </>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
        <div className="divide-y divide-line">
          {plan.steps.map((step, index) => {
            const complete = step.blockers.length === 0;
            const Icon = complete ? CheckCircle2 : Circle;
            const percent = step.progress.total === 0
              ? 0
              : Math.round((step.progress.done / step.progress.total) * 100);

            // A cleared stage collapses to a single line.
            //
            // It used to get the identical two-column layout as a blocked one,
            // with a panel the height of a blocker list whose whole content was
            // "Nothing blocking this stage." Five clear stages meant five of
            // those, so the gates that actually needed reading were spaced out
            // by the ones that did not.
            //
            // The stage stays in the list rather than disappearing. These are
            // gates a product passes repeatedly, not steps an account finishes:
            // add a sixth exporter with no facility and stage 2 blocks again.
            // Collapsing keeps the whole path visible and lets a stage expand
            // itself when it re-blocks, with no state to manage.
            if (complete) {
              return (
                <section
                  key={step.id}
                  id={`gate-${step.id}`}
                  className="flex scroll-mt-6 flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Stage {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-ink">{step.title}</span>
                  <StatusBadge tone={stepTone(step)}>{stepLabel(step)}</StatusBadge>
                  <span className="text-xs font-medium text-slate-500">{stepProgressLabel(step)}</span>
                  {/* Kept: it is how the list behind a cleared stage is reached
                      from here at all, and a row with nowhere to go is a dead
                      end rather than a tidy one. */}
                  <Link href={step.href} className="ml-auto text-sm font-semibold text-forest hover:underline">
                    {step.actionLabel}
                  </Link>
                </section>
              );
            }

            return (
              <section
                key={step.id}
                // Anchored so the dashboard's gate rows can land on the stage
                // whose blockers they are counting.
                id={`gate-${step.id}`}
                className="grid scroll-mt-6 gap-4 px-5 py-5 lg:grid-cols-[260px_1fr]"
              >
                <div className="flex gap-3">
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                    complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    {/* "Stage", not "Step". The order is real — you cannot
                        classify a product you have not created — but nothing
                        here is stepped through once and left behind. */}
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Stage {index + 1}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusBadge tone={stepTone(step)}>{stepLabel(step)}</StatusBadge>
                      <span className="text-xs font-medium text-slate-500">{stepProgressLabel(step)}</span>
                      <Link href={step.href} className="text-sm font-semibold text-forest hover:underline">
                        {step.actionLabel}
                      </Link>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${complete ? "bg-emerald-500" : "bg-amber-400"}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Only blocked stages reach here — a clear one returned above,
                    so there is no longer an empty-state panel to render. */}
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
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
