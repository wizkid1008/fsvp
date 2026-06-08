import type {
  SectionWeight,
  RequirementItemRow,
  EvidenceRow,
  SectionScore,
  ScoreResult,
  ApprovalThresholdRow,
  ApprovalStatus,
} from "./types";

// ── Section-level scoring ────────────────────────────────────────────────────

function scoreSingleSection(
  weight: SectionWeight,
  items: RequirementItemRow[],
  evidence: EvidenceRow[]
): SectionScore {
  const today = new Date().toISOString().slice(0, 10);

  const sectionItems = items.filter((i) => i.section_id === weight.section_id);
  const required = sectionItems.filter((i) => i.is_required);
  const criticalItems = sectionItems.filter((i) => i.is_critical_blocker);

  // Evidence lookup: item_id → status (latest accepted wins)
  const evidenceByItem = new Map<string, EvidenceRow>();
  for (const ev of evidence) {
    if (!ev.requirement_item_id) continue;
    const existing = evidenceByItem.get(ev.requirement_item_id);
    // Prefer accepted over any other status
    if (!existing || ev.evidence_status === "accepted") {
      evidenceByItem.set(ev.requirement_item_id, ev);
    }
  }

  function isItemSatisfied(item: RequirementItemRow): boolean {
    const ev = evidenceByItem.get(item.id);
    if (!ev) return item.auto_accept;
    if (ev.evidence_status !== "accepted") return item.auto_accept;
    if (item.expiration_applies && ev.expiration_date && ev.expiration_date < today) return false;
    return true;
  }

  const satisfiedRequired = required.filter(isItemSatisfied);
  const missingRequired = required.filter((i) => !isItemSatisfied(i));

  const criticalBlockerMissing = criticalItems.some((i) => !isItemSatisfied(i));

  // Raw section score (0–100)
  // 0 required items → auto 100 (section is N/A or all optional)
  const rawScore =
    required.length === 0
      ? 100
      : (satisfiedRequired.length / required.length) * 100;

  return {
    section_key: weight.section_key,
    section_name: weight.section_name,
    weight_percent: weight.weight_percent,
    raw_score: Math.round(rawScore * 100) / 100,
    weighted_contribution: (rawScore * weight.weight_percent) / 100,
    required_count: required.length,
    accepted_count: satisfiedRequired.length,
    missing_count: missingRequired.length,
    critical_blocker_missing: criticalBlockerMissing,
  };
}

// ── Overall score ────────────────────────────────────────────────────────────

export function calculateScore(
  weights: SectionWeight[],
  items: RequirementItemRow[],
  evidence: EvidenceRow[],
  thresholds: ApprovalThresholdRow[]
): ScoreResult {
  const sectionScores: Record<string, SectionScore> = {};
  let overallScore = 0;
  let criticalBlockersPresent = false;

  for (const weight of weights) {
    const section = scoreSingleSection(weight, items, evidence);
    sectionScores[weight.section_key] = section;
    overallScore += section.weighted_contribution;
    if (section.critical_blocker_missing) criticalBlockersPresent = true;
  }

  overallScore = Math.round(overallScore * 100) / 100;

  const approvalStatus = resolveApprovalStatus(
    overallScore,
    criticalBlockersPresent,
    thresholds
  );

  return {
    overall_score: overallScore,
    approval_status: approvalStatus,
    critical_blockers_present: criticalBlockersPresent,
    section_scores: sectionScores,
    section_scores_json: sectionScores as unknown as import("@/types/database").Json,
  };
}

// ── Approval status resolution ───────────────────────────────────────────────

function resolveApprovalStatus(
  score: number,
  criticalBlockersPresent: boolean,
  thresholds: ApprovalThresholdRow[]
): ApprovalStatus {
  const sorted = [...thresholds].sort((a, b) => b.min_score - a.min_score);
  const matched = sorted.find(
    (t) => score >= t.min_score && score <= t.max_score
  );

  let rawStatus: string = matched?.resulting_status ?? "not_approved";

  // Critical blocker rule: cannot exceed conditionally_approved
  if (criticalBlockersPresent) {
    const blockerCap: Record<string, ApprovalStatus> = {
      importer_approved: "conditionally_approved",
    };
    rawStatus = blockerCap[rawStatus] ?? rawStatus;
  }

  return rawStatus as ApprovalStatus;
}

// ── Section completion percentage (used in UI progress indicators) ───────────

export function sectionCompletionPercent(section: SectionScore): number {
  if (section.required_count === 0) return 100;

  const accepted = section.accepted_count;
  const total = section.required_count;

  if (accepted === 0) return 0;
  if (accepted < Math.ceil(total / 2)) return 25;
  if (accepted < total) return 50;
  if (section.critical_blocker_missing) return 75;
  return 100;
}
