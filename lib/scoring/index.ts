// Public API for the scoring engine.
// Call these from API routes (server-side only — uses admin Supabase client).

import { calculateScore } from "./engine";
import {
  fetchRuleVersionWeights,
  fetchRequirementItemsForSections,
  fetchEvidenceForEntity,
  fetchApprovalStatusMap,
  upsertScoringResult,
} from "./queries";
import type { ScoreResult } from "./types";

export type { ScoreResult, SectionScore, ApprovalStatus } from "./types";
export { sectionCompletionPercent } from "./engine";
export { fetchApprovalStatusMap } from "./queries";

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

  const combined = (facilityResult.overall_score + productResult.overall_score) / 2;
  const criticalPresent =
    facilityResult.critical_blockers_present || productResult.critical_blockers_present;

  const mergedSections = {
    ...facilityResult.section_scores,
    ...productResult.section_scores,
  };

  // facilityResult/productResult.approval_status come straight from the configured
  // approval_thresholds.resulting_status (seeded as importer_approved /
  // conditionally_approved / needs_corrective_action / rejected — see
  // supabase/migrations/021_rules_engine_schema_extensions.sql), with "not_approved"
  // only ever appearing as calculateScore()'s own fallback when no threshold row
  // covers the score. A rejected facility or product must not let the combined
  // FSVP record read as anything better than conditionally_approved.
  const eitherRejected =
    ["rejected", "not_approved"].includes(facilityResult.approval_status) ||
    ["rejected", "not_approved"].includes(productResult.approval_status);

  const result: ScoreResult = {
    overall_score: Math.round(combined * 100) / 100,
    approval_status: eitherRejected
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
