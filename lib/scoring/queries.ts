// Supabase data fetchers for the scoring engine.
// These run server-side (admin client) so no RLS applies.

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  SectionWeight,
  RequirementItemRow,
  EvidenceRow,
  ApprovalThresholdRow,
} from "./types";

export async function fetchRuleVersionWeights(
  ruleVersionId: string,
  appliesTo: "facility" | "product"
): Promise<{ weights: SectionWeight[]; thresholds: ApprovalThresholdRow[] }> {
  const admin = createAdminSupabaseClient();

  const [weightsRes, thresholdsRes] = await Promise.all([
    (admin.from("scoring_category_weights") as any)
      .select(
        `id, section_id, weight_percent,
         requirement_sections!inner(section_key, section_name, applies_to)`
      )
      .eq("rule_version_id", ruleVersionId),
    (admin.from("approval_thresholds") as any)
      .select("min_score, max_score, resulting_status")
      .eq("rule_version_id", ruleVersionId),
  ]);

  if (weightsRes.error) throw new Error(`fetchWeights: ${weightsRes.error.message}`);
  if (thresholdsRes.error) throw new Error(`fetchThresholds: ${thresholdsRes.error.message}`);

  type WeightRow = {
    section_id: string;
    weight_percent: number;
    requirement_sections: {
      section_key: string;
      section_name: string;
      applies_to: "facility" | "product" | "supplier";
    } | null;
  };
  type ThresholdRow = { min_score: number; max_score: number; resulting_status: string };

  const weights: SectionWeight[] = ((weightsRes.data ?? []) as WeightRow[])
    .filter((w) => w.requirement_sections?.applies_to === appliesTo)
    .map((w) => ({
      section_id: w.section_id,
      section_key: w.requirement_sections!.section_key,
      section_name: w.requirement_sections!.section_name,
      applies_to: w.requirement_sections!.applies_to,
      weight_percent: Number(w.weight_percent),
    }));

  const thresholds: ApprovalThresholdRow[] = ((thresholdsRes.data ?? []) as ThresholdRow[]).map((t) => ({
    min_score: Number(t.min_score),
    max_score: Number(t.max_score),
    resulting_status: t.resulting_status,
  }));

  return { weights, thresholds };
}

export async function fetchRequirementItemsForSections(
  sectionIds: string[]
): Promise<RequirementItemRow[]> {
  if (sectionIds.length === 0) return [];
  const admin = createAdminSupabaseClient();
  const { data, error } = await (admin.from("requirement_items") as any)
    .select("id, section_id, item_key, item_name, is_required, is_critical_blocker, auto_accept, expiration_applies")
    .in("section_id", sectionIds);

  if (error) throw new Error(`fetchRequirementItems: ${error.message}`);
  return (data ?? []) as RequirementItemRow[];
}

export async function fetchEvidenceForEntity(
  entityType: "facility" | "product",
  entityId: string
): Promise<EvidenceRow[]> {
  const admin = createAdminSupabaseClient();

  type DocRow = {
    requirement_item_id: string | null;
    evidence_status: string;
    expiration_date: string | null;
  };

  const docQuery = (admin.from("documents") as any)
    .select("requirement_item_id, evidence_status, expiration_date")
    .is("soft_deleted_at", null);

  const finalQuery =
    entityType === "facility"
      ? docQuery.eq("facility_id", entityId)
      : docQuery.eq("linked_entity_type", "product").eq("linked_entity_id", entityId);

  const { data, error } = await finalQuery;
  if (error) throw new Error(`fetchEvidence: ${error.message}`);

  return ((data ?? []) as DocRow[]).map((d) => ({
    requirement_item_id: d.requirement_item_id ?? null,
    evidence_status: d.evidence_status as EvidenceRow["evidence_status"],
    expiration_date: d.expiration_date ?? null,
  }));
}

export async function upsertScoringResult(
  entityType: "facility" | "product" | "fsvp_record",
  entityId: string,
  ruleVersionId: string,
  overallScore: number,
  sectionScoresJson: unknown,
  criticalBlockersPresent: boolean
): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await (admin.from("scoring_results") as any).upsert(
    {
      entity_type: entityType,
      entity_id: entityId,
      rule_version_id: ruleVersionId,
      overall_score: overallScore,
      section_scores: sectionScoresJson,
      critical_blockers_present: criticalBlockersPresent,
      is_stale: false,
      calculated_at: new Date().toISOString(),
    },
    { onConflict: "entity_type,entity_id,rule_version_id" }
  );
  if (error) throw new Error(`upsertScoringResult: ${error.message}`);
}
