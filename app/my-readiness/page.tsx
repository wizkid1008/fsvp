import { AppShell } from "@/components/layout/AppShell";
import { SupplierReadinessPanel } from "@/components/readiness/SupplierReadinessPanel";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { getSupplierContext } from "@/lib/supplier-context";
import { computeSupplierReadiness, readinessLabel } from "@/lib/readiness/supplier-score";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function scoreColor(score: number) {
  if (score >= 90) return "text-emerald-600";
  if (score >= 75) return "text-amber-500";
  if (score >= 50) return "text-orange-500";
  return "text-red-500";
}

function scoreTone(score: number): StatusTone {
  if (score >= 90) return "success";
  if (score >= 75) return "warning";
  return "danger";
}

export default async function MyReadinessPage() {
  const { role, realRole, supabase, user } = await requireProfileRole("/my-readiness", ["supplier", "exporter", "administrator"]);

  const supplierCtx = await getSupplierContext(supabase as any, user.id);
  const readiness = await computeSupplierReadiness(supabase as any, supplierCtx?.supplierId ?? null);

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="My Readiness"
        description="See how your records and submitted evidence track against FSVP requirements."
      />

      {/* The same number the dashboard tile shows — both call
          computeSupplierReadiness. The panel below no longer draws its own
          ring, because it was a different calculation wearing the same label. */}
      <section className="mt-6 rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Readiness</p>
            <p className={`mt-1 text-4xl font-bold tabular-nums ${scoreColor(readiness.score)}`}>
              {readiness.score}%
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {readiness.scored
                ? `${readiness.acceptedCount} of ${readiness.requiredCount} required company documents accepted by your importer.`
                : "No rule version has been published yet, so no score can be calculated."}
            </p>
          </div>
          <StatusBadge tone={scoreTone(readiness.score)}>{readinessLabel(readiness)}</StatusBadge>
        </div>
        <p className="mt-4 border-t border-line pt-3 text-xs leading-5 text-slate-500">
          This measures the evidence you have submitted. Your importer runs a separate
          FSVP record assessment covering hazard analysis, verification and approval —
          a clean score here does not by itself approve a product for entry.
        </p>
      </section>

      <div className="mt-6">
        <SupplierReadinessPanel supabase={supabase} showScore={false} />
      </div>
    </AppShell>
  );
}
