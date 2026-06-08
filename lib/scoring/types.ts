import type { Json } from "@/types/database";

export type EvidenceStatus =
  | "not_submitted"
  | "submitted"
  | "under_review"
  | "accepted"
  | "needs_revision"
  | "rejected"
  | "expired";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "conditionally_approved"
  | "improvement_required"
  | "not_approved"
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
