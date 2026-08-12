import type { FsvpRecordStatus } from "@/types/database";

export type ApprovalDecision = "approved" | "conditionally_approved" | "rejected" | "revision_requested";

export const VALID_DECISIONS: ApprovalDecision[] = [
  "approved",
  "conditionally_approved",
  "rejected",
  "revision_requested",
];

export function isValidDecision(value: unknown): value is ApprovalDecision {
  return typeof value === "string" && (VALID_DECISIONS as string[]).includes(value);
}

// Maps an importer's approval decision to the status written on fsvp_records.
export const DECISION_STATUS_MAP: Record<ApprovalDecision, FsvpRecordStatus> = {
  approved: "importer_approved",
  conditionally_approved: "conditionally_approved",
  rejected: "rejected",
  revision_requested: "needs_corrective_action",
};

export function statusForDecision(decision: ApprovalDecision): FsvpRecordStatus {
  return DECISION_STATUS_MAP[decision];
}

export function isValidReassessmentMonths(months: number | undefined): boolean {
  return months === undefined || (months >= 1 && months <= 120);
}

// Adds `months` calendar months to an ISO date string, returning an ISO string.
export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}
