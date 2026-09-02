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
import { fetchImporterSignals } from "@/lib/dashboard/importer-signals";
import { FSVP_SETUP_STEPS } from "@/lib/setup/fsvp-steps";
import { ArrowRight, ClipboardList, PackageCheck, ShieldCheck } from "lucide-react";

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

  /**
   * The first canonical step with work outstanding.
   *
   * This used to run exporter → facility → product → record, skipping
   * classification and admissibility entirely. On a real account that produced
   * "Next step 6 of 11 — Open FSVP record" while the tile beside it said five
   * products needed reference coverage — and step 6 cannot be done first,
   * because opening a record requires a live applicability determination, which
   * requires a classified product with a known origin.
   *
   * signals.referenceGaps counts products missing classification, origin OR a
   * current admissibility determination, so once classification is clean any
   * gap that remains is admissibility.
   */
  const referenceGaps = signals?.referenceGaps.length ?? 0;

  const nextStepId =
    supplierIds.length === 0 ? "exporter"
    : (facilityCount ?? 0) === 0 ? "facility"
    : products.length === 0 ? "product"
    : unclassified > 0 ? "classification"
    : referenceGaps > 0 ? "admissibility"
    : fsvpRows.length === 0 || (signals?.undeterminedPairs ?? 0) > 0 ? "record"
    : null;

  const nextStep = nextStepId
    ? FSVP_SETUP_STEPS.find((step) => step.id === nextStepId) ?? null
    : null;

  const nextStepNumber = nextStep
    ? FSVP_SETUP_STEPS.findIndex((s) => s.id === nextStep.id) + 1
    : null;

  const stageSummary = summariseStages(fsvpRows);

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
        { label: "Applicability undetermined", value: signals.undeterminedPairs, href: "/applicability", danger: false },
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
        />
      )}

      {signals && !signals.clear && (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
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

      {signals && (
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            {/* Not "FSVP journey" — the journey is the eleven-step path on
                /setup/fsvp, and a second thing wearing that name taught a
                different, shorter story about what FSVP requires. This is a
                grouping of what is currently gating approvals. */}
            <div>
              <h2 className="text-sm font-semibold text-ink">What&apos;s gating approvals</h2>
              <p className="mt-1 text-sm text-slate-500">
                The open controls that most directly affect whether a product can be approved and
                shipped. For the full path, see <Link href="/setup/fsvp" className="font-semibold text-forest hover:underline">Complete FSVP Setup</Link>.
              </p>
            </div>
            <Link
              href="/entry-readiness"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
            >
              <PackageCheck className="h-4 w-4" />
              Entry readiness
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              {
                label: "Supplier evidence",
                value: signals.pendingReview + signals.expiring.length,
                detail: signals.pendingReview > 0
                  ? `${signals.pendingReview} submission${signals.pendingReview === 1 ? "" : "s"} awaiting review`
                  : signals.expiring.length > 0
                  ? `${signals.expiring.length} accepted document${signals.expiring.length === 1 ? "" : "s"} expiring`
                  : "No supplier evidence tasks blocking you",
                href: "/importer-review",
              },
              {
                label: "QI and record gates",
                value: signals.unsignedRecords + signals.undeterminedPairs,
                detail: signals.unsignedRecords > 0
                  ? `${signals.unsignedRecords} record${signals.unsignedRecords === 1 ? "" : "s"} missing signatures`
                  : signals.undeterminedPairs > 0
                  ? `${signals.undeterminedPairs} product${signals.undeterminedPairs === 1 ? "" : "s"} need applicability`
                  : "Applicability and signatures are current",
                href: "/fsvp-records",
              },
              {
                label: "Entry and monitoring",
                value: signals.shipmentReadinessBlocks.length + signals.screeningBlocks.length + signals.referenceGaps.length,
                detail: signals.referenceGaps.length > 0
                  ? `${signals.referenceGaps.length} product${signals.referenceGaps.length === 1 ? "" : "s"} need reference coverage`
                  : signals.screeningBlocks.length > 0
                  ? `${signals.screeningBlocks.length} supplier${signals.screeningBlocks.length === 1 ? "" : "s"} need screening`
                  : "Shipment checks and compliance screening are clear",
                href: "/entry-readiness",
              },
            ].map((item) => (
              <Link key={item.label} href={item.href} className="rounded-md border border-line bg-slate-50 p-4 transition hover:border-forest hover:bg-white">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">{item.label}</p>
                  <StatusBadge tone={item.value > 0 ? "warning" : "success"}>{item.value}</StatusBadge>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{item.detail}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Setup first. An unstarted account is not "clear" — it has done nothing
          yet, and saying otherwise is how a new importer ends up staring at a
          green tick wondering what to do next. */}
      {nextStep && (
        <section className="rounded-lg border border-forest/30 bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Next step &middot; {nextStepNumber} of {FSVP_SETUP_STEPS.length}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-ink">{nextStep.title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">{nextStep.description}</p>
              {/* The proportional view of setup, kept in the same card as the
                  step number so the page states "4 of 11" exactly once. */}
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-forest transition-all"
                  style={{ width: `${(((nextStepNumber ?? 1) - 1) / FSVP_SETUP_STEPS.length) * 100}%` }}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={nextStep.href}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d]"
              >
                {nextStep.actionLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/setup/fsvp"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
              >
                See all steps
              </Link>
            </div>
          </div>
        </section>
      )}

      {signals?.clear && !nextStep && (
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
