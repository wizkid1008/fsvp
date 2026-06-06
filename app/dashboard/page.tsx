import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { requireUser } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { APP_SUBTITLE } from "@/lib/constants";
import { CheckCircle2, Circle } from "lucide-react";
import type { Profile } from "@/types/database";

export const runtime = "edge";

type ProfileLookup = { data: Profile | null };

const IMPORTER_STEPS = [
  { label: "Complete your profile", href: "/account", key: "profile" },
  { label: "Add a supplier", href: "/suppliers", key: "supplier" },
  { label: "Add a product or facility", href: "/products", key: "product" },
  { label: "Upload evidence", href: "/evidence", key: "evidence" },
  { label: "Run readiness assessment", href: "/readiness", key: "readiness" },
];

const SUPPLIER_STEPS = [
  { label: "Complete your profile", href: "/account", key: "profile" },
  { label: "Upload your evidence", href: "/my-evidence", key: "evidence" },
  { label: "Resolve open requests", href: "/my-requests", key: "readiness" },
];

export default async function DashboardPage() {
  const { supabase, user } = await requireUser("/dashboard");

  const [
    { data: profile },
    { count: supplierCount },
    { count: productCount },
    { count: documentCount },
    { count: assessmentCount },
    { count: actionCount },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle() as unknown as Promise<ProfileLookup>,
    supabase.from("suppliers").select("id", { count: "exact", head: true }) as unknown as Promise<{ count: number | null }>,
    supabase.from("products_verify").select("id", { count: "exact", head: true }) as unknown as Promise<{ count: number | null }>,
    supabase.from("documents").select("id", { count: "exact", head: true }) as unknown as Promise<{ count: number | null }>,
    supabase.from("readiness_assessments").select("id", { count: "exact", head: true }) as unknown as Promise<{ count: number | null }>,
    supabase.from("corrective_actions").select("id", { count: "exact", head: true }).eq("status", "open") as unknown as Promise<{ count: number | null }>,
  ]);

  const displayName = profile?.full_name || user.email || "New user";
  const role = profile?.role ?? "supplier";
  const status = profile?.user_status ?? "pending";
  const profileComplete = !!(profile?.full_name && profile.organization_name);

  const isSupplier = role === "supplier";
  const isImporter = role === "us_importer";
  const STEPS = isSupplier ? SUPPLIER_STEPS : IMPORTER_STEPS;

  const stepDone: Record<string, boolean> = isSupplier
    ? {
        profile: profileComplete,
        evidence: (documentCount ?? 0) > 0,
        readiness: (actionCount ?? 0) === 0,
      }
    : {
        profile: profileComplete,
        supplier: (supplierCount ?? 0) > 0,
        product: (productCount ?? 0) > 0,
        evidence: (documentCount ?? 0) > 0,
        readiness: (assessmentCount ?? 0) > 0,
      };

  const completedSteps = Object.values(stepDone).filter(Boolean).length;
  const progressPct = Math.round((completedSteps / STEPS.length) * 100);

  const metrics = isSupplier
    ? [
        { label: "Documents Submitted", value: String(documentCount ?? 0), href: "/my-evidence", tone: (documentCount ?? 0) > 0 ? "info" as const : "neutral" as const },
        { label: "Open Requests", value: String(actionCount ?? 0), href: "/my-requests", tone: (actionCount ?? 0) > 0 ? "danger" as const : "success" as const },
      ]
    : [
        { label: "Suppliers", value: String(supplierCount ?? 0), href: "/suppliers", tone: (supplierCount ?? 0) > 0 ? "info" as const : "neutral" as const },
        { label: "Documents", value: String(documentCount ?? 0), href: "/evidence", tone: (documentCount ?? 0) > 0 ? "info" as const : "neutral" as const },
        { label: "Open Actions", value: String(actionCount ?? 0), href: "/gaps-actions", tone: (actionCount ?? 0) > 0 ? "danger" as const : "success" as const },
        { label: "Assessments", value: String(assessmentCount ?? 0), href: "/readiness", tone: (assessmentCount ?? 0) > 0 ? "success" as const : "neutral" as const },
      ];

  const showOnboarding = completedSteps === 0;

  return (
    <AppShell role={role}>
      {showOnboarding && <OnboardingModal role={role} />}
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Dashboard</p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">{displayName}</h1>
            <p className="mt-1 text-sm text-slate-500">{profile?.organization_name || "No organization linked yet"} · {APP_SUBTITLE}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="info">{role}</StatusBadge>
            <StatusBadge tone={status === "active" ? "success" : "warning"}>{status}</StatusBadge>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <Link key={m.label} href={m.href} className="group rounded-lg border border-line bg-white p-5 shadow-soft transition hover:border-forest">
            <p className="text-sm font-medium text-slate-500 group-hover:text-forest">{m.label}</p>
            <p className="mt-2 text-4xl font-semibold text-ink">{m.value}</p>
            <StatusBadge tone={m.tone} className="mt-3">{m.tone === "neutral" ? "None yet" : "Active"}</StatusBadge>
          </Link>
        ))}
      </section>

      <section className="mt-4 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h2 className="text-base font-semibold text-ink">Recent Activity</h2>
          <div className="mt-6 flex flex-col items-center justify-center rounded-md border border-dashed border-line bg-slate-50 py-12 text-center">
            <p className="text-sm font-semibold text-slate-600">No activity yet</p>
            <p className="mt-1 text-sm text-slate-400">Actions, reviews, and uploads will appear here.</p>
            <Link href="/suppliers" className="mt-5 inline-flex h-9 items-center rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-[#195f4d]">
              Start with suppliers
            </Link>
          </div>
        </div>

        <aside className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Setup Progress</h2>
            <span className="text-sm font-bold text-forest">{progressPct}%</span>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-forest transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <ol className="mt-5 space-y-2">
            {STEPS.map((step, i) => {
              const done = stepDone[step.key];
              return (
                <li key={step.key}>
                  <Link
                    href={step.href}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition ${
                      done
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-line bg-white text-slate-700 hover:border-forest hover:bg-slate-50"
                    }`}
                  >
                    {done
                      ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      : <Circle className="h-4 w-4 shrink-0 text-slate-300" />
                    }
                    <span className="font-medium">{step.label}</span>
                    {!done && <span className="ml-auto text-xs text-slate-400">Step {i + 1}</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
        </aside>
      </section>
    </AppShell>
  );
}
