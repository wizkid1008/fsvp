// One exporter-facing readiness number, computed in one place.
//
// This calculation used to be inlined in ExporterDashboard while
// SupplierReadinessPanel drew a second, unrelated ring from the legacy
// `fsvp_requirements` table. Two numbers both labelled "Readiness", differing by
// tens of points on the same account, is worse than no number at all — so the
// dashboard tile and /my-readiness now both call this.
//
// It reads the SAME published rule version the scoring engine reads
// (requirement_sections / requirement_items / scoring_category_weights), so an
// exporter's score moves for the same reasons an importer's rules say it should.
//
// It is NOT the importer's `readiness_assessments.overall_score`. That one is
// scored per FSVP record, is admissibility-gated, and is readable only by the
// owning importer and reviewers under RLS (001_baseline_rls.sql). Showing it to
// exporters is a disclosure decision, not a refactor.

import { acceptedCount, statusesByItem, type EvidenceViewer } from "./evidence-scope";

type SupabaseLike = { from: (table: string) => any };

export type SupplierReadiness = {
  /** 0–100, rounded. 0 when no rule version is published. */
  score: number;
  /** True when a published rule version supplied the weights. */
  scored: boolean;
  requiredCount: number;
  acceptedCount: number;
};

const EMPTY: SupplierReadiness = { score: 0, scored: false, requiredCount: 0, acceptedCount: 0 };

export async function computeSupplierReadiness(
  supabase: SupabaseLike,
  supplierId: string | null
): Promise<SupplierReadiness> {
  if (!supplierId) return EMPTY;

  const { data: publishedVersion } = await (supabase.from("rule_versions") as any)
    .select("id")
    .eq("status", "published")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!publishedVersion?.id) return EMPTY;

  // Both callers are exporter-side, so the viewer is the exporter itself: it has
  // no single counterparty, and a relationship-scoped item is only done when
  // every importer it serves has one. See lib/readiness/evidence-scope.ts.
  const [weightsRes, itemsRes, docsRes, linksRes] = await Promise.all([
    (supabase.from("scoring_category_weights") as any)
      .select("section_id, weight_percent")
      .eq("rule_version_id", publishedVersion.id),
    (supabase.from("requirement_sections") as any)
      .select("id, requirement_items(id, is_required, is_critical_blocker, evidence_scope)")
      .eq("rule_version_id", publishedVersion.id)
      .eq("applies_to", "supplier"),
    (supabase.from("documents") as any)
      .select("requirement_item_id, evidence_status, importer_id")
      .eq("supplier_id", supplierId)
      .is("soft_deleted_at", null)
      .not("requirement_item_id", "is", null),
    (supabase.from("supplier_relationships") as any)
      .select("importer_id")
      .eq("relationship_type", "importer_supplier")
      .eq("supplier_id", supplierId)
      .in("status", ["active", "pending_invite"]),
  ]);

  const viewer: EvidenceViewer = {
    kind: "exporter",
    linkedImporterIds: [...new Set(
      ((linksRes.data ?? []) as Array<{ importer_id: string | null }>)
        .map((link) => link.importer_id)
        .filter((id): id is string => Boolean(id))
    )],
  };

  const weightBySection = new Map(
    ((weightsRes.data ?? []) as Array<{ section_id: string; weight_percent: number }>)
      .map((w) => [w.section_id, Number(w.weight_percent)])
  );

  const sections = (itemsRes.data ?? []) as Array<{
    id: string;
    requirement_items: Array<{ id: string; is_required: boolean; evidence_scope?: string | null }>;
  }>;

  const statuses = statusesByItem(
    sections.flatMap((section) => section.requirement_items ?? []),
    (docsRes.data ?? []) as Array<{
      requirement_item_id: string | null;
      evidence_status: string | null;
      importer_id: string | null;
    }>,
    viewer
  );

  let score = 0;
  let requiredCount = 0;
  let accepted = 0;

  for (const section of sections) {
    const required = (section.requirement_items ?? []).filter((item) => item.is_required);
    if (required.length === 0) continue;

    const sectionAccepted = acceptedCount(required, statuses);

    requiredCount += required.length;
    accepted += sectionAccepted;
    score += (sectionAccepted / required.length) * (weightBySection.get(section.id) ?? 0);
  }

  return {
    score: Math.min(Math.round(score), 100),
    scored: true,
    requiredCount,
    acceptedCount: accepted,
  };
}

export function readinessLabel(readiness: SupplierReadiness): string {
  if (!readiness.scored) return "Not scored";
  if (readiness.score >= 90) return "Ready";
  if (readiness.score >= 50) return "In Progress";
  return "Not Started";
}
