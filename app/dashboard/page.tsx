import { AppShell } from "@/components/layout/AppShell";
import { ExporterDashboard } from "@/components/dashboard/ExporterDashboard";
import { ManufacturerDashboard } from "@/components/dashboard/ManufacturerDashboard";
import { ReviewerDashboard } from "@/components/dashboard/ReviewerDashboard";
import { requireUser } from "@/lib/auth/protection";
import { getSupplierContext, getSupplierContextById, isExporterType } from "@/lib/supplier-context";
import { getPreviewRole, getPreviewSupplierId, resolveEffectiveRole, resolvePreviewedAccountId } from "@/lib/preview-role";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Profile } from "@/types/database";

export const runtime = "edge";

// ── Importer dashboard (kept inline — minimal changes needed) ──
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { ImporterActionsSection } from "@/components/dashboard/ImporterActionsSection";
import { ProgramStatus } from "@/components/dashboard/ProgramStatus";
import { summariseProducts } from "@/lib/dashboard/product-journey";
import { WhatNeedsDoing } from "@/components/dashboard/WhatNeedsDoing";
import { outstandingCount, outstandingWork } from "@/lib/dashboard/outstanding-work";
import { loadCompleteFsvpSetupPlan } from "@/lib/setup/fsvp-workflow";
import { fetchImporterSignals } from "@/lib/dashboard/importer-signals";
import { ArrowRight, ClipboardList, ShieldCheck } from "lucide-react";

async function ImporterDashboard({
  importerId,
  organizationName,
  userStatus,
  displayName,
  isPreview,
  supabase,
}: {
  importerId: string | null;
  organizationName: string | null;
  userStatus: string | null;
  displayName: string;
  /** An administrator viewing a picked importer account, not their own. */
  isPreview: boolean;
  supabase: any;
}) {
  const { count: supplierCount } = isPreview
    ? { count: null }
    : await (supabase
        .from("suppliers")
        .select("id", { count: "exact", head: true }) as Promise<{ count: number | null }>);

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

  const signals = importerId
    ? await fetchImporterSignals(supabase, importerId, supplierIds)
    : null;

  /**
   * The gates, from the same planner /setup/fsvp reads.
   *
   * These counts used to be derived here from signals, while the pipeline page
   * derived the same eleven gates from loadCompleteFsvpSetupPlan. The two
   * disagreed in front of the user: this page said "Create product — Done"
   * (is there at least one product?) while the pipeline said "1 blocker —
   * Cocoa Powder is missing its facility link" (does every product carry its
   * exporter and facility?), and the row here linked to the row there that
   * contradicted it.
   *
   * The planner owns what outstanding means. Signals stays for the deadline
   * work below — expiring documents, overdue reassessments, corrective actions
   * — which the planner does not compute.
   */
  const plan = importerId ? await loadCompleteFsvpSetupPlan(supabase, importerId) : null;
  const gates = plan ? outstandingWork(plan.steps) : [];
  const gatesClear = outstandingCount(gates) === 0;
  const productSummary = summariseProducts(plan?.productStandings ?? []);
  const setupSummary = plan?.summary ?? {
    exporters: 0,
    approvedExporters: 0,
    facilities: 0,
    approvedFacilities: 0,
    products: 0,
    records: 0,
    approvedRecords: 0,
    packages: 0,
  };

  return (
    <div className="space-y-6">
      {!isPreview && (supplierCount ?? 0) === 0 && <OnboardingModal role="us_importer" />}

      <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">
              {organizationName ?? displayName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isPreview ? `Previewing as this importer — signed in as ${displayName}` : `Welcome back, ${displayName}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isPreview && (
              <StatusBadge tone={userStatus === "active" ? "success" : "warning"}>
                {userStatus ?? "pending"}
              </StatusBadge>
            )}
            <Link
              href="/setup/fsvp"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
            >
              <ClipboardList className="h-4 w-4" />
              FSVP pipeline
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <ProgramStatus
        summary={productSummary}
        supplyChain={{
          exporters:          setupSummary.exporters,
          approvedExporters:  setupSummary.approvedExporters,
          facilities:         setupSummary.facilities,
          approvedFacilities: setupSummary.approvedFacilities,
        }}
      />

      <WhatNeedsDoing gates={gates} />

      {signals?.clear && gatesClear && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <ShieldCheck className="h-4 w-4" />
            Nothing needs your attention
          </p>
          <p className="mt-0.5 text-sm text-emerald-800">
            No evidence waiting on you, nothing expiring in the next 60 days, no overdue
            reassessments, and every open record carries a qualified individual signature.
          </p>
        </div>
      )}

      {signals && <ImporterActionsSection signals={signals} />}

    </div>
  );
}

type ImporterView =
  | { kind: "none" }
  | { kind: "pick" }
  | { kind: "show"; importerId: string | null; organizationName: string | null; isPreview: boolean; client: any };

async function resolveAdminImporterView(previewImporterId: string | null): Promise<ImporterView> {
  if (!previewImporterId) return { kind: "pick" };
  const admin = createAdminSupabaseClient();
  const { data: importer } = await (admin.from("importers") as any)
    .select("id, display_name")
    .eq("id", previewImporterId)
    .maybeSingle();
  // The preview cookie may name a supplier left over from previewing another
  // role; that is not an importer, so ask for one rather than show zeros.
  if (!importer) return { kind: "pick" };
  return {
    kind: "show",
    importerId: importer.id,
    organizationName: importer.display_name,
    isPreview: true,
    client: admin,
  };
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

  // Which importer the importer dashboard is about. A real importer sees their
  // own. An administrator previewing the importer role used to get their OWN
  // profile here — unlinked to any importer — so the page showed the admin's
  // organization name, zero products, and "Nothing is open. Every gate is
  // clear." Other importer pages already scope to the previewed account via
  // resolvePreviewedAccountId; this one now does too, with the admin client
  // (the admin's own session is not a member of that tenant). Every query
  // below is filtered by importerId or its linked suppliers, so bypassing RLS
  // does not widen what is shown.
  const importerView: ImporterView = !isImporter
    ? { kind: "none" }
    : realRole !== "administrator"
      ? {
          kind: "show",
          importerId: profile?.importer_id ?? null,
          organizationName: profile?.organization_name ?? null,
          isPreview: false,
          client: supabase,
        }
      : await resolveAdminImporterView(resolvePreviewedAccountId(realRole, null));

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

      {isImporter && importerView.kind === "pick" && (
        <div className="rounded-lg border border-line bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink">Pick an importer account to preview</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            You are signed in as an administrator, which is not linked to any importer. In the role
            preview, choose a specific importer account rather than &ldquo;Generic US Importer&rdquo;
            to see their dashboard.
          </p>
        </div>
      )}

      {isImporter && importerView.kind === "show" && (
        <ImporterDashboard
          importerId={importerView.importerId}
          organizationName={importerView.organizationName}
          userStatus={profile?.user_status ?? null}
          displayName={displayName}
          isPreview={importerView.isPreview}
          supabase={importerView.client}
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
