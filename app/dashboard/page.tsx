import { AppShell } from "@/components/layout/AppShell";
import { ExporterDashboard } from "@/components/dashboard/ExporterDashboard";
import { ManufacturerDashboard } from "@/components/dashboard/ManufacturerDashboard";
import { ReviewerDashboard } from "@/components/dashboard/ReviewerDashboard";
import { requireUser } from "@/lib/auth/protection";
import { getSupplierContext, isExporterType } from "@/lib/supplier-context";
import type { Profile } from "@/types/database";

export const runtime = "edge";

// ── Importer dashboard (kept inline — minimal changes needed) ──
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

async function ImporterDashboard({
  profile,
  displayName,
  supabase,
}: {
  profile: Profile | null;
  displayName: string;
  supabase: any;
}) {
  const [
    { count: supplierCount },
    { count: productCount },
    { count: facilityCount },
    { count: documentCount },
    { count: actionCount },
    { data: rawFsvp },
  ] = await Promise.all([
    supabase.from("suppliers").select("id", { count: "exact", head: true }) as Promise<{ count: number | null }>,
    supabase.from("products_verify").select("id", { count: "exact", head: true }) as Promise<{ count: number | null }>,
    supabase.from("facilities_verify").select("id", { count: "exact", head: true }) as Promise<{ count: number | null }>,
    supabase.from("documents").select("id", { count: "exact", head: true }) as Promise<{ count: number | null }>,
    (supabase.from("corrective_actions") as any).select("id", { count: "exact", head: true }).eq("status", "open") as Promise<{ count: number | null }>,
    (supabase.from("fsvp_records") as any).select("status, reassessment_due_at"),
  ]);

  const fsvpRows = (rawFsvp ?? []) as Array<{ status: string; reassessment_due_at: string | null }>;
  const now = new Date();
  const fsvp = {
    total:          fsvpRows.length,
    approved:       fsvpRows.filter((r) => r.status === "importer_approved").length,
    conditional:    fsvpRows.filter((r) => r.status === "conditionally_approved").length,
    pending:        fsvpRows.filter((r) => ["draft", "importer_review_pending", "supplier_evidence_accepted"].includes(r.status)).length,
    reassessmentDue: fsvpRows.filter((r) => r.reassessment_due_at && new Date(r.reassessment_due_at) <= now).length,
  };

  const metrics = [
    { label: "Suppliers",    value: supplierCount ?? 0,  href: "/suppliers",    tone: "info"    as StatusTone },
    { label: "Evidence",     value: documentCount ?? 0,  href: "/evidence",     tone: "info"    as StatusTone },
    { label: "Open Actions", value: actionCount ?? 0,    href: "/gaps-actions", tone: (actionCount ?? 0) > 0 ? "danger" as StatusTone : "success" as StatusTone },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">
              {profile?.organization_name ?? displayName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">Welcome back, {displayName}</p>
          </div>
          <StatusBadge tone={profile?.user_status === "active" ? "success" : "warning"}>
            {profile?.user_status ?? "pending"}
          </StatusBadge>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((m) => (
          <Link key={m.label} href={m.href}
            className="group flex items-center justify-between rounded-lg border border-line bg-white p-4 shadow-soft hover:border-forest transition">
            <p className="text-sm font-semibold text-slate-600 group-hover:text-forest">{m.label}</p>
            <p className="text-3xl font-bold text-ink">{m.value}</p>
          </Link>
        ))}
      </div>

      {fsvp.total > 0 && (
        <section className="rounded-lg border border-line bg-white shadow-soft">
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">FSVP Records</h2>
          </div>
          <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {[
              { label: "Approved",         value: fsvp.approved,        tone: "success" as StatusTone },
              { label: "Conditional",      value: fsvp.conditional,     tone: "warning" as StatusTone },
              { label: "Pending Review",   value: fsvp.pending,         tone: "info"    as StatusTone },
              { label: "Reassessment Due", value: fsvp.reassessmentDue, tone: fsvp.reassessmentDue > 0 ? "danger" as StatusTone : "neutral" as StatusTone },
            ].map((item) => (
              <Link key={item.label} href="/fsvp-records"
                className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition">
                <p className="text-sm text-slate-600">{item.label}</p>
                <StatusBadge tone={item.tone}>{item.value}</StatusBadge>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Main dashboard page ────────────────────────────────────────

export default async function DashboardPage() {
  const { supabase, user } = await requireUser("/dashboard");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle() as unknown as { data: Profile | null };

  const role        = profile?.role ?? "supplier";
  const displayName = profile?.full_name ?? user.email?.split("@")[0] ?? "User";
  const isSupplier  = role === "supplier";
  const isImporter  = role === "us_importer";
  const isReviewer  = role === "reviewer" || role === "administrator";

  // Determine supplier context for supplier-role users
  const supplierCtx = isSupplier
    ? await getSupplierContext(supabase as any, user.id)
    : null;

  const supplierId   = supplierCtx?.supplierId   ?? null;
  const supplierType = supplierCtx?.supplierType ?? null;
  const isExporter   = isSupplier && isExporterType(supplierType);

  return (
    <AppShell role={role} supplierType={supplierType}>
      {isSupplier && isExporter && (
        <ExporterDashboard
          supplierId={supplierId}
          companyName={supplierCtx?.companyName ?? null}
          displayName={displayName}
          supabase={supabase as any}
        />
      )}

      {isSupplier && !isExporter && (
        <ManufacturerDashboard
          supplierId={supplierId}
          companyName={supplierCtx?.companyName ?? null}
          displayName={displayName}
          supabase={supabase as any}
        />
      )}

      {isImporter && (
        <ImporterDashboard
          profile={profile}
          displayName={displayName}
          supabase={supabase}
        />
      )}

      {isReviewer && (
        <ReviewerDashboard
          displayName={displayName}
          supabase={supabase as any}
        />
      )}
    </AppShell>
  );
}
