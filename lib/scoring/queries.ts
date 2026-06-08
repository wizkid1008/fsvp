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

  const weights: SectionWeight[] = (weightsRes.data ?? [])
    .filter((w) => {
      const sec = w.requirement_sections as { applies_to: string } | null;
      return sec?.applies_to === appliesTo;
    })
    .map((w) => {
      const sec = w.requirement_sections as {
        section_key: string;
        section_name: string;
        applies_to: "facility" | "product" | "supplier";
      };
      return {
        section_id: w.section_id,
        section_key: sec.section_key,
        section_name: sec.section_name,
        applies_to: sec.applies_to,
        weight_percent: Number(w.weight_percent),
      };
    });

  const thresholds: ApprovalThresholdRow[] = (thresholdsRes.data ?? []).map((t) => ({
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
  return data ?? [];
}

export async function fetchEvidenceForEntity(
  entityType: "facility" | "product",
  entityId: string
): Promise<EvidenceRow[]> {
  const admin = createAdminSupabaseClient();

  let query = admin
    .from("documents")
    .select("requirement_item_id, evidence_status, expiration_date")
    .is("soft_deleted_at", null);

  if (entityType === "facility") {
    query = query.eq("facility_id", entityId);
  } else {
    query = query.eq("linked_entity_type", "product").eq("linked_entity_id", entityId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`fetchEvidence: ${error.message}`);

  return (data ?? []).map((d) => ({
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
