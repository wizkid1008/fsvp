import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ScoringWeightsEditor } from "@/components/admin/rules/ScoringWeightsEditor";
import { RequirementItemsPanel } from "@/components/admin/rules/RequirementItemsPanel";
import { ApprovalThresholdsEditor } from "@/components/admin/rules/ApprovalThresholdsEditor";
import {
  CloneVersionButton,
  PublishVersionButton,
  ArchiveVersionButton,
} from "@/components/admin/rules/RuleVersionActions";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

export default async function RuleVersionPage({
  params,
}: {
  params: { versionId: string };
}) {
  const { supabase, role } = await requireProfileRole("/admin/rules", ["administrator"]);
  const { versionId } = params;

  const { data: version } = await (supabase.from("rule_versions") as any)
    .select(`
      id, version_number, status, published_at, archived_at, notes,
      rule_sets!inner(set_name, applies_to)
    `)
    .eq("id", versionId)
    .maybeSingle();

  if (!version) return notFound();

  const ruleSet = version.rule_sets as { set_name: string; applies_to: string };
  const isDraft = version.status === "draft";

  const [{ data: rawWeights }, { data: rawThresholds }, { data: rawSections }] = await Promise.all([
    (supabase.from("scoring_category_weights") as any)
      .select(`id, section_id, weight_percent, requirement_sections!inner(section_key, section_name, applies_to)`)
      .eq("rule_version_id", versionId),
    (supabase.from("approval_thresholds") as any)
      .select("id, label, min_score, max_score, resulting_status")
      .eq("rule_version_id", versionId)
      .order("min_score", { ascending: false }),
    (supabase.from("requirement_sections") as any)
      .select(`id, section_key, section_name, applies_to, sort_order`)
      .eq("rule_version_id", versionId)
      .order("sort_order"),
  ]);

  const sectionIds = (rawSections ?? []).map((s: { id: string }) => s.id);
  const { data: rawItems } = sectionIds.length > 0
    ? await (supabase.from("requirement_items") as any)
        .select("id, section_id, item_key, item_name, description, evidence_type, is_required, is_critical_blocker, auto_accept, expiration_applies, cfr_citation, sort_order")
        .in("section_id", sectionIds)
        .order("sort_order")
    : { data: [] };

  const weights = (rawWeights ?? []).map((w: {
    section_id: string;
    weight_percent: number;
    requirement_sections: { section_key: string; section_name: string; applies_to: string };
  }) => ({
    section_id: w.section_id,
    section_key: w.requirement_sections.section_key,
    section_name: w.requirement_sections.section_name,
    applies_to: w.requirement_sections.applies_to as "facility" | "product" | "supplier",
    weight_percent: Number(w.weight_percent),
  }));

  const thresholds = (rawThresholds ?? []).map((t: {
    id: string;
    label: string;
    min_score: number;
    max_score: number;
    resulting_status: string;
  }) => ({
    id: t.id,
    label: t.label,
    min_score: Number(t.min_score),
    max_score: Number(t.max_score),
    resulting_status: t.resulting_status,
  }));

  const sections = (rawSections ?? []).map((s: {
    id: string;
    section_key: string;
    section_name: string;
    applies_to: string;
    sort_order: number;
  }) => ({
    id: s.id,
    section_key: s.section_key,
    section_name: s.section_name,
    applies_to: s.applies_to,
    items: (rawItems ?? []).filter((i: { section_id: string }) => i.section_id === s.id),
  }));

  const statusTone: StatusTone =
    version.status === "published" ? "success" :
    version.status === "draft" ? "info" : "neutral";

  return (
    <AppShell role={role}>
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/admin/rules" className="text-sm text-slate-500 hover:text-ink">Rules Engine</Link>
            <span className="text-slate-300">/</span>
            <span className="text-sm text-slate-700 font-medium">{ruleSet.set_name}</span>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-semibold text-ink">v{version.version_number}</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">
              {ruleSet.set_name} — Version {version.version_number}
            </h1>
            <StatusBadge tone={statusTone}>
              {version.status.charAt(0).toUpperCase() + version.status.slice(1)}
            </StatusBadge>
          </div>
          {version.notes && (
            <p className="mt-1 text-sm text-slate-500">{version.notes}</p>
          )}
          {version.published_at && (
            <p className="mt-1 text-xs text-slate-400">
              Published {new Date(version.published_at).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDraft && <PublishVersionButton versionId={versionId} />}
          {version.status === "published" && <CloneVersionButton versionId={versionId} />}
          {version.status === "published" && <ArchiveVersionButton versionId={versionId} />}
        </div>
      </div>

      {!isDraft && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This version is <strong>{version.status}</strong> and cannot be edited.
          {version.status === "published" && " Clone it to create a new draft."}
        </div>
      )}

      {/* Tab sections rendered as stacked panels */}
      <div className="mt-6 space-y-8">

        {/* Scoring Weights */}
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="mb-5 border-b border-line pb-4">
            <h2 className="text-base font-semibold text-ink">Scoring Weights</h2>
            <p className="mt-1 text-sm text-slate-500">
              Facility and product section weights must each total exactly 100%. Changes here recalculate all linked scores.
            </p>
          </div>
          <ScoringWeightsEditor
            versionId={versionId}
            isDraft={isDraft}
            initialWeights={weights}
          />
        </section>

        {/* Requirement Items */}
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="mb-5 border-b border-line pb-4">
            <h2 className="text-base font-semibold text-ink">Requirement Items</h2>
            <p className="mt-1 text-sm text-slate-500">
              Define what evidence is required in each section. Critical blockers prevent full approval even at high scores.
            </p>
          </div>
          <RequirementItemsPanel sections={sections} isDraft={isDraft} />
        </section>

        {/* Approval Thresholds */}
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="mb-5 border-b border-line pb-4">
            <h2 className="text-base font-semibold text-ink">Approval Thresholds</h2>
            <p className="mt-1 text-sm text-slate-500">
              Score ranges that determine FSVP record status. Ranges must not overlap.
            </p>
          </div>
          <ApprovalThresholdsEditor
            versionId={versionId}
            isDraft={isDraft}
            initialThresholds={thresholds}
          />
        </section>

      </div>
    </AppShell>
  );
}
