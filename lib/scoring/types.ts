import type { Json } from "@/types/database";

export type EvidenceStatus =
  | "not_submitted"
  | "submitted"
  | "under_review"
  | "accepted"
  | "needs_revision"
  | "rejected"
  | "expired";

// Two vocabularies land here: calculateScore() returns whatever string is
// configured in approval_thresholds.resulting_status (seeded as
// importer_approved / conditionally_approved / needs_corrective_action /
// rejected, or "not_approved" if no threshold matches), while
// scoreFsvpRecord() in ./index.ts derives its own approved/not_approved/
// improvement_required labels from the combined facility+product score.
// This type is a superset of both so it accurately reflects what can
// actually come back — it does not imply the two vocabularies agree.
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "importer_approved"
  | "conditionally_approved"
  | "improvement_required"
  | "needs_corrective_action"
  | "not_approved"
  | "rejected"
  | "suspended";

export interface SectionWeight {
  section_id: string;
  section_key: string;
  section_name: string;
  applies_to: "facility" | "product" | "supplier";
  weight_percent: number;
}

export interface RequirementItemRow {
  id: string;
  section_id: string;
  item_key: string;
  item_name: string;
  is_required: boolean;
  is_critical_blocker: boolean;
  auto_accept: boolean;
  expiration_applies: boolean;
}

export interface EvidenceRow {
  requirement_item_id: string | null;
  evidence_status: EvidenceStatus;
  expiration_date: string | null;
}

export interface SectionScore {
  section_key: string;
  section_name: string;
  weight_percent: number;
  raw_score: number;          // 0–100 within the section
  weighted_contribution: number;
  required_count: number;
  accepted_count: number;
  missing_count: number;
  critical_blocker_missing: boolean;
}

export interface ScoreResult {
  overall_score: number;
  approval_status: ApprovalStatus;
  critical_blockers_present: boolean;
  section_scores: Record<string, SectionScore>;
  section_scores_json: Json;
}

export interface ApprovalThresholdRow {
  min_score: number;
  max_score: number;
  resulting_status: string;
}
