import { AppShell } from "@/components/layout/AppShell";
import { ExporterDashboard } from "@/components/dashboard/ExporterDashboard";
import { ManufacturerDashboard } from "@/components/dashboard/ManufacturerDashboard";
import { ReviewerDashboard } from "@/components/dashboard/ReviewerDashboard";
import { requireUser } from "@/lib/auth/protection";
import { getSupplierContext, getSupplierContextById, isExporterType } from "@/lib/supplier-context";
import { getPreviewRole, getPreviewSupplierId, resolveEffectiveRole } from "@/lib/preview-role";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Profile } from "@/types/database";

export const runtime = "edge";

// ── Importer dashboard (kept inline — minimal changes needed) ──
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { ImporterActionsSection } from "@/components/dashboard/ImporterActionsSection";
import { FsvpProcessFlow } from "@/components/dashboard/FsvpProcessFlow";
import { fetchImporterSignals } from "@/lib/dashboard/importer-signals";
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
    { data: rawFsvp },
  ] = await Promise.all([
    supabase.from("suppliers").select("id", { count: "exact", head: true }) as Promise<{ count: number | null }>,
    (supabase.from("fsvp_records") as any)
      .select("id, status, reassessment_due_at, facilities_verify(facility_name), products_verify(product_name)"),
  ]);

  const importerId: string | null = profile?.importer_id ?? null;

  const { data: rels } = importerId
    ? await (supabase.from("supplier_relationships") as any)
        .select("supplier_id")
        .eq("relationship_type", "importer_supplier")
        .eq("importer_id", importerId)
        .in("status", ["active", "pending_invite"])
    : { data: [] };

  const supplierIds = ((rels ?? []) as Array<{ supplier_id: string }>)
    .map((r) => r.supplier_id)
    .filter(Boolean);

  const fsvpRows = (rawFsvp ?? []) as Array<{ status: string; reassessment_due_at: string | null }>;
  const now = new Date();
  const fsvp = {
    total:          fsvpRows.length,
    approved:       fsvpRows.filter((r) => r.status === "importer_approved").length,
    conditional:    fsvpRows.filter((r) => r.status === "conditionally_approved").length,
    pending:        fsvpRows.filter((r) => ["draft", "importer_review_pending", "supplier_evidence_accepted"].includes(r.status)).length,
    reassessmentDue: fsvpRows.filter((r) => r.reassessment_due_at && new Date(r.reassessment_due_at) <= now).length,
  };

  const signals = importerId
    ? await fetchImporterSignals(supabase, importerId, supplierIds)
    : null;

  // These used to be Exporters / Products / Facilities / Evidence / Open Actions
  // — every one of which is a sidebar item, so the row was a second nav with
  // counts bolted on. What an importer needs on opening the app is not how many
  // products exist but what is about to go wrong, so each tile is now a thing
  // that needs doing and links to the view that shows it.
  const metrics: Array<{ label: string; value: number; href: string; danger: boolean }> = signals
    ? [
        { label: "Awaiting your review",   value: signals.pendingReview,      href: "/importer-review", danger: false },
        { label: "Expiring in 60 days",    value: signals.expiring.length,    href: "/evidence",        danger: true  },
        { label: "Reassessments overdue",  value: signals.overdue.length,     href: "/fsvp-records",    danger: true  },
        { label: "Open corrective actions",value: signals.actions.length,     href: "/gaps-actions",    danger: true  },
        { label: "Records unsigned",       value: signals.unsignedRecords,    href: "/fsvp-records",    danger: false },
      ]
    : [];

  return (
    <div className="space-y-6">
      {(supplierCount ?? 0) === 0 && <OnboardingModal role="us_importer" />}

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

      {signals && !signals.clear && (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((m) => (
            <Link key={m.label} href={m.href}
              className="group flex flex-col justify-between gap-2 rounded-lg border border-line bg-white p-4 shadow-soft transition hover:border-forest">
              <p className="text-sm font-semibold text-slate-600 group-hover:text-forest">{m.label}</p>
              <p className={`text-3xl font-bold ${
                m.value === 0 ? "text-slate-300" : m.danger ? "text-red-600" : "text-ink"
              }`}>
                {m.value}
              </p>
            </Link>
          ))}
        </div>
      )}

      {signals?.clear && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="text-sm font-semibold text-emerald-900">Nothing needs your attention</p>
          <p className="mt-0.5 text-sm text-emerald-800">
            No evidence waiting on you, nothing expiring in the next 60 days, no overdue
            reassessments, and every open record carries a qualified individual signature.
          </p>
        </div>
      )}

      {signals && <ImporterActionsSection signals={signals} />}

      {fsvpRows.length > 0 && (
        <FsvpProcessFlow
          records={(rawFsvp ?? []).map((r: any) => ({
            id: r.id,
            status: r.status,
            reassessment_due_at: r.reassessment_due_at,
            facility_name: r.facilities_verify?.facility_name ?? null,
            product_name: r.products_verify?.product_name ?? null,
          }))}
        />
      )}

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

  const realRole = profile?.role ?? "supplier";
  const role     = resolveEffectiveRole(realRole, getPreviewRole());
  const displayName = profile?.full_name ?? user.email?.split("@")[0] ?? "User";
  const isExporter  = role === "exporter";
  const isSupplier  = role === "supplier";
  const isImporter  = role === "us_importer";
  const isReviewer  = role === "reviewer" || role === "administrator";

  // Fetch supplier context for exporter/supplier roles. When an admin is
  // previewing a specific real account, resolve that account's own data
  // (via the admin client, since the admin's own row has no supplier link)
  // instead of the signed-in admin's own (nonexistent) supplier context.
  const previewSupplierId = realRole === "administrator" ? getPreviewSupplierId() : null;
  const supplierCtx = (isExporter || isSupplier)
    ? previewSupplierId
      ? await getSupplierContextById(createAdminSupabaseClient(), previewSupplierId)
      : await getSupplierContext(supabase as any, user.id)
    : null;

  const supplierId = supplierCtx?.supplierId ?? null;

  return (
    <AppShell role={role} realRole={realRole}>
      {isExporter && (
        <ExporterDashboard
          supplierId={supplierId}
          companyName={supplierCtx?.companyName ?? null}
          displayName={displayName}
          supabase={supabase as any}
        />
      )}

      {isSupplier && (
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
