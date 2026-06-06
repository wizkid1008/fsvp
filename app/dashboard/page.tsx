import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireUser } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { APP_SUBTITLE } from "@/lib/constants";
import type { Profile } from "@/types/database";

export const runtime = "edge";

type ProfileLookup = {
  data: Pick<Profile, "email" | "full_name" | "organization_name" | "role" | "user_status"> | null;
};

type CountLookup = {
  count: number | null;
};

async function getCount(table: "documents", supabase: ReturnType<typeof createServerSupabaseClient>) {
  const result = (await supabase.from(table).select("id", { count: "exact", head: true })) as unknown as CountLookup;
  return result.count ?? 0;
}

export default async function DashboardPage() {
  const { supabase, user } = await requireUser("/dashboard");

  const { data: profile } = (await supabase
    .from("profiles")
    .select("email,full_name,organization_name,role,user_status")
    .eq("id", user.id)
    .maybeSingle()) as unknown as ProfileLookup;

  const documentCount = await getCount("documents", supabase);
  const displayName = profile?.full_name || user?.email || "New user";
  const role = profile?.role ?? "supplier";
  const status = profile?.user_status ?? "pending";

  const metrics = [
    { label: "Supplier records", value: "0", detail: "Create or import suppliers", tone: "neutral" as const },
    { label: "Documents uploaded", value: String(documentCount), detail: "Stored in Supabase", tone: documentCount > 0 ? ("info" as const) : ("neutral" as const) },
    { label: "Open corrective actions", value: "0", detail: "No actions assigned", tone: "neutral" as const },
    { label: "Readiness reports", value: "0", detail: "No reports generated", tone: "neutral" as const }
  ];

  const setupSteps = [
    "Complete your profile and organization details.",
    "Create the first supplier record.",
    "Add products, commodities, and facilities.",
    "Upload FSVP evidence and map it to requirements.",
    "Run the readiness assessment when evidence exists."
  ];

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Risk Dashboard"
        description={`${APP_SUBTITLE}. Your dashboard is connected to Supabase and will populate as your organization creates supplier, product, document, and assessment records.`}
        action="Start Supplier Review"
      />

      <section className="mt-6 rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">Signed in as</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">{displayName}</h2>
            <p className="mt-1 text-sm text-slate-600">{profile?.organization_name || "No organization linked yet"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="info">{role}</StatusBadge>
            <StatusBadge tone={status === "active" ? "success" : "warning"}>{status}</StatusBadge>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-slate-500">{metric.label}</p>
              <StatusBadge tone={metric.tone}>{metric.value}</StatusBadge>
            </div>
            <p className="mt-3 text-3xl font-semibold text-ink">{metric.value}</p>
            <p className="mt-2 text-sm text-slate-600">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">Workspace Activity</h2>
            <StatusBadge tone="neutral">Empty</StatusBadge>
          </div>
          <div className="mt-8 rounded-md border border-dashed border-line bg-slate-50 px-5 py-10 text-center">
            <p className="text-base font-semibold text-ink">No supplier activity yet</p>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              This area will populate from Supabase after supplier records, documents, reviews, and readiness
              assessments are created for your account.
            </p>
          </div>
        </div>
        <aside className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h2 className="text-base font-semibold text-ink">Setup Checklist</h2>
          <div className="mt-4 space-y-3">
            {setupSteps.map((step) => (
              <label key={step} className="flex items-start gap-3 rounded-md border border-line p-3 text-sm text-slate-700">
                <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-forest" />
                <span>{step}</span>
              </label>
            ))}
          </div>
          <Link href="/suppliers" className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-[#195f4d]">
            Open suppliers
          </Link>
        </aside>
      </section>
    </AppShell>
  );
}
