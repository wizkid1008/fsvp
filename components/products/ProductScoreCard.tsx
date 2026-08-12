import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";
import type { AdmissibilityBlock } from "@/lib/admissibility/gate";

type SupabaseLike = { from: (table: string) => any };

function thresholdTone(status: string | null): StatusTone {
  if (!status) return "neutral";
  if (status === "importer_approved") return "success";
  if (status === "conditionally_approved") return "warning";
  if (status === "needs_corrective_action") return "warning";
  if (status === "rejected") return "danger";
  return "neutral";
}

function thresholdLabel(label: string | null, hasDocs: boolean): string {
  if (!hasDocs) return "Not Started";
  return label ?? "In Progress";
}

export async function ProductScoreCard({
  productId,
  supabase,
  admissibilityBlocks = [],
}: {
  productId: string;
  supabase: SupabaseLike;
  admissibilityBlocks?: AdmissibilityBlock[];
}) {
  const { data: pubVersion } = await (supabase.from("rule_versions") as any)
    .select("id")
    .eq("status", "published")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pubVersion?.id) return null;

  const [sectionsRes, weightsRes, itemsRes, docsRes, thresholdsRes] = await Promise.all([
    (supabase.from("requirement_sections") as any)
      .select("id, section_key, section_name")
      .eq("rule_version_id", pubVersion.id)
      .eq("applies_to", "product")
      .order("sort_order"),

    (supabase.from("scoring_category_weights") as any)
      .select("section_id, weight_percent")
      .eq("rule_version_id", pubVersion.id),

    (supabase.from("requirement_sections") as any)
      .select("id, requirement_items(id, is_required, is_critical_blocker)")
      .eq("rule_version_id", pubVersion.id)
      .eq("applies_to", "product"),

    (supabase.from("documents") as any)
      .select("requirement_item_id, evidence_status")
      .eq("linked_entity_type", "product")
      .eq("linked_entity_id", productId)
      .is("soft_deleted_at", null)
      .not("requirement_item_id", "is", null),

    (supabase.from("approval_thresholds") as any)
      .select("label, min_score, max_score, resulting_status")
      .eq("rule_version_id", pubVersion.id)
      .order("min_score", { ascending: false }),
  ]);

  const sections: Array<{ id: string; section_name: string }> = sectionsRes.data ?? [];
  const weightMap = new Map<string, number>(
    ((weightsRes.data ?? []) as Array<{ section_id: string; weight_percent: number }>)
      .map((w) => [w.section_id, Number(w.weight_percent)])
  );

  type RawSec = { id: string; requirement_items: Array<{ id: string; is_required: boolean; is_critical_blocker: boolean }> };
  const itemsBySectionId = new Map<string, Array<{ id: string; is_critical_blocker: boolean }>>();
  for (const sec of (itemsRes.data ?? []) as RawSec[]) {
    itemsBySectionId.set(sec.id, (sec.requirement_items ?? []).filter((i) => i.is_required));
  }

  const docByItemId = new Map<string, string[]>();
  for (const doc of (docsRes.data ?? []) as Array<{ requirement_item_id: string | null; evidence_status: string | null }>) {
    if (!doc.requirement_item_id) continue;
    const existing = docByItemId.get(doc.requirement_item_id) ?? [];
    existing.push(doc.evidence_status ?? "not_submitted");
    docByItemId.set(doc.requirement_item_id, existing);
  }

  let totalScore = 0;
  let completeSections = 0;
  let totalRequired = 0;
  let totalAccepted = 0;
  let hasAnyCriticalBlocker = false;

  for (const sec of sections) {
    const items = itemsBySectionId.get(sec.id) ?? [];
    const weight = weightMap.get(sec.id) ?? 0;
    let accepted = 0;

    for (const item of items) {
      const statuses = docByItemId.get(item.id) ?? [];
      if (statuses.includes("accepted")) {
        accepted++;
      } else if (item.is_critical_blocker) {
        hasAnyCriticalBlocker = true;
      }
    }

    totalRequired += items.length;
    totalAccepted += accepted;

    if (items.length > 0) {
      const sectionPct = (accepted / items.length) * 100;
      totalScore += sectionPct * (weight / 100);
      if (accepted === items.length) completeSections++;
    }
  }

  const score = Math.round(totalScore);
  const hasDocs = totalAccepted > 0;

  const thresholds = (thresholdsRes.data ?? []) as Array<{
    label: string;
    min_score: number;
    max_score: number;
    resulting_status: string;
  }>;
  const matched = thresholds.find((t) => score >= t.min_score && score <= t.max_score) ?? null;

  const admissibilityBlocked = admissibilityBlocks.length > 0;
  const displayLabel = admissibilityBlocked
    ? "Not approvable"
    : thresholdLabel(matched?.label ?? null, hasDocs);
  const tone = admissibilityBlocked ? "danger" : hasDocs ? thresholdTone(matched?.resulting_status ?? null) : "neutral";

  const ringColor =
    score >= 90 ? "text-emerald-500" :
    score >= 75 ? "text-amber-400" :
    score >= 60 ? "text-amber-500" :
    score > 0   ? "text-red-400"   : "text-slate-300";

  const barColor =
    score >= 90 ? "bg-emerald-500" :
    score >= 75 ? "bg-amber-400" :
    score >= 60 ? "bg-amber-500" :
    score > 0   ? "bg-red-400"   : "bg-slate-200";

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        Product Readiness Score
      </p>

      <div className="mt-3 flex items-center gap-4">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#f1f5f9" strokeWidth="8" />
            <circle
              cx="40" cy="40" r="34"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - score / 100)}`}
              className={`transition-all ${ringColor}`}
            />
          </svg>
          <span className={`text-lg font-bold tabular-nums ${ringColor}`}>{score}%</span>
        </div>

        <div className="min-w-0">
          <StatusBadge tone={tone}>{displayLabel}</StatusBadge>
          {hasAnyCriticalBlocker && (
            <p className="mt-1.5 text-xs font-semibold text-red-600">
              Critical blockers pending
            </p>
          )}
          {admissibilityBlocked && (
            <p className="mt-1.5 text-xs font-semibold text-red-600">
              Admissibility blockers pending
            </p>
          )}
          <p className="mt-1.5 text-sm text-slate-600">
            <span className="font-semibold text-ink">{completeSections}</span> of{" "}
            <span className="font-semibold text-ink">{sections.length}</span> sections complete
          </p>
          <p className="text-xs text-slate-400">
            {totalAccepted} of {totalRequired} documents accepted
          </p>
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${score}%` }}
        />
      </div>

      <p className="mt-3 text-xs text-slate-400">
        The evidence score is only one input. Admissibility must also be current and non-prohibited
        before this product can be treated as approvable.
      </p>
    </section>
  );
}
