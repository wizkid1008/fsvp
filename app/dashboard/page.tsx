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
import { ProgramStatus } from "@/components/dashboard/ProgramStatus";
import { RecordProgressList } from "@/components/dashboard/RecordProgressList";
import { summariseStages } from "@/lib/fsvp/record-stages";
import { WhatNeedsDoing } from "@/components/dashboard/WhatNeedsDoing";
import { outstandingCount, outstandingWork } from "@/lib/dashboard/outstanding-work";
import { fetchImporterSignals } from "@/lib/dashboard/importer-signals";
import { ArrowRight, ClipboardList, ShieldCheck } from "lucide-react";

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

  const signals = importerId
    ? await fetchImporterSignals(supabase, importerId, supplierIds)
    : null;

  // `signals.clear` only measures whether EXISTING work is decaying — evidence
  // expiring, reassessments overdue, signatures missing. On an account that has
  // created nothing yet every one of those counts is zero, so a brand-new
  // importer with ten of eleven setup steps outstanding was told "Nothing needs
  // your attention". Two counts are enough to tell "not started" from "all
  // clear".
  const [{ count: facilityCount }, { data: productRows }] = supplierIds.length
    ? await Promise.all([
        (supabase.from("facilities_verify") as any)
          .select("id", { count: "exact", head: true })
          .in("supplier_id", supplierIds) as Promise<{ count: number | null }>,
        // Columns rather than a head count: the next step cannot be worked out
        // from how many products exist, only from what is missing on them.
        (supabase.from("products_verify") as any)
          .select("id, commodity_id, country_of_origin")
          .eq("lifecycle", "active")
          .in("supplier_id", supplierIds) as Promise<{
            data: Array<{ commodity_id: string | null; country_of_origin: string | null }> | null;
          }>,
      ])
    : [{ count: 0 }, { data: [] }];

  const products = productRows ?? [];
  const unclassified = products.filter((p) => !p.commodity_id || !p.country_of_origin).length;

  const stageSummary = summariseStages(fsvpRows);

  /**
   * Every canonical gate, with how many items still need it.
   *
   * This replaces a chain that picked the FIRST outstanding step and showed it
   * as the account's position. Two things were wrong with that. It could not
   * reach past step six — screening, evidence review, QI attestations,
   * approval and the inspection package were unreachable, so the card went
   * quiet exactly when signing and approval began. And it modelled a per-item
   * pipeline as one global cursor: "Classify product" was true of five
   * products, and there was no way to say that three need classification while
   * two need admissibility and a record further on is stuck at QI.
   *
   * The counts come from signals rather than from the capped display lists —
   * `referenceGaps` and friends stop at eight rows.
   */
  const gates = outstandingWork({
    exporterCount:        supplierIds.length,
    facilityCount:        facilityCount ?? 0,
    productCount:         products.length,
    unclassifiedProducts: unclassified,
    referenceGapCount:    signals?.referenceGapCount ?? 0,
    undeterminedPairs:    signals?.undeterminedPairs ?? 0,
    screeningBlockCount:  signals?.screeningBlockCount ?? 0,
    pendingReview:        signals?.pendingReview ?? 0,
    unsignedRecords:      signals?.unsignedRecords ?? 0,
    recordsInReview:      stageSummary.byStage[2],
    approvedRecords:      stageSummary.byStage[3],
  });

  const gatesClear = outstandingCount(gates) === 0;

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
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={profile?.user_status === "active" ? "success" : "warning"}>
              {profile?.user_status ?? "pending"}
            </StatusBadge>
            <Link
              href="/setup/fsvp"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
            >
              <ClipboardList className="h-4 w-4" />
              Complete setup
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Before any worklist. The page could say how many records were
          unsigned and how many products lacked applicability without once
          saying how many records exist and how many are approved — counts of
          what is wrong are a worklist, not a status. */}
      <ProgramStatus summary={stageSummary} />

      {/* Directly under the overview, because they answer the same question at
          two zoom levels: the track above says how far the programme has got,
          each row below says how far one record has. Separating them put the
          per-record bars under three sections of counts, where a reader
          looking for "where is Cocoa Nibs" would not think to scroll. */}
      {fsvpRows.length > 0 && (
        <RecordProgressList
          records={(rawFsvp ?? []).map((r: any) => ({
            id: r.id,
            status: r.status,
            reassessment_due_at: r.reassessment_due_at,
            facility_name: r.facilities_verify?.facility_name ?? null,
            product_name: r.products_verify?.product_name ?? null,
          }))}
          unsignedRecordIds={signals?.unsignedRecordIds ?? []}
        />
      )}

      {/* One section where there were three — six metric tiles, three "what's
          gating approvals" buckets and a "next step · 4 of 11" card, all the
          same data at different aggregations. The named items those tiles
          counted are still listed below in Needs your attention. */}
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
