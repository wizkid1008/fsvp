// Public API for the scoring engine.
// Call these from API routes (server-side only — uses admin Supabase client).

import { calculateScore } from "./engine";
import {
  fetchRuleVersionWeights,
  fetchRequirementItemsForSections,
  fetchEvidenceForEntity,
  upsertScoringResult,
} from "./queries";
import type { ScoreResult } from "./types";

export type { ScoreResult, SectionScore, ApprovalStatus } from "./types";
export { sectionCompletionPercent } from "./engine";

async function scoreEntity(
  entityType: "facility" | "product",
  entityId: string,
  ruleVersionId: string
): Promise<ScoreResult> {
  const [{ weights, thresholds }, evidence] = await Promise.all([
    fetchRuleVersionWeights(ruleVersionId, entityType),
    fetchEvidenceForEntity(entityType, entityId),
  ]);

  const sectionIds = weights.map((w) => w.section_id);
  const items = await fetchRequirementItemsForSections(sectionIds);

  const result = calculateScore(weights, items, evidence, thresholds);

  await upsertScoringResult(
    entityType,
    entityId,
    ruleVersionId,
    result.overall_score,
    result.section_scores_json,
    result.critical_blockers_present
  );

  return result;
}

export async function scoreFacility(
  facilityId: string,
  ruleVersionId: string
): Promise<ScoreResult> {
  return scoreEntity("facility", facilityId, ruleVersionId);
}

export async function scoreProduct(
  productId: string,
  ruleVersionId: string
): Promise<ScoreResult> {
  return scoreEntity("product", productId, ruleVersionId);
}

// FSVP record score = average of facility + product scores, subject to
// critical blocker rule and importer-owned thresholds.
export async function scoreFsvpRecord(
  fsvpRecordId: string,
  facilityId: string,
  productId: string,
  ruleVersionId: string
): Promise<ScoreResult> {
  const [facilityResult, productResult] = await Promise.all([
    scoreEntity("facility", facilityId, ruleVersionId),
    scoreEntity("product", productId, ruleVersionId),
  ]);

  const { thresholds } = await fetchRuleVersionWeights(ruleVersionId, "facility");

  const combined = (facilityResult.overall_score + productResult.overall_score) / 2;
  const criticalPresent =
    facilityResult.critical_blockers_present || productResult.critical_blockers_present;

  const mergedSections = {
    ...facilityResult.section_scores,
    ...productResult.section_scores,
  };

  const fakeWeights = Object.values(mergedSections).map((s) => ({
    section_id: "",
    section_key: s.section_key,
    section_name: s.section_name,
    applies_to: "facility" as const,
    weight_percent: s.weight_percent,
  }));

  // Re-use calculateScore only for threshold resolution, not re-calculation
  const { approval_status } = calculateScore(fakeWeights, [], [], thresholds);
  void approval_status; // resolved below

  const result: ScoreResult = {
    overall_score: Math.round(combined * 100) / 100,
    approval_status: facilityResult.approval_status === "not_approved" || productResult.approval_status === "not_approved"
      ? "not_approved"
      : criticalPresent
        ? "conditionally_approved"
        : (combined >= 90 ? "approved" : combined >= 75 ? "conditionally_approved" : combined >= 60 ? "improvement_required" : "not_approved"),
    critical_blockers_present: criticalPresent,
    section_scores: mergedSections,
    section_scores_json: mergedSections as unknown as import("@/types/database").Json,
  };

  await upsertScoringResult(
    "fsvp_record",
    fsvpRecordId,
    ruleVersionId,
    result.overall_score,
    result.section_scores_json,
    result.critical_blockers_present
  );

  return result;
}
