/**
 * What a facility's or product's approval status means, in one place.
 *
 * The status comes from the entity's latest scoring_results row, resolved
 * against approval_thresholds (lib/scoring/queries.ts, resolveApprovalStatuses).
 * An entity never scored has NO status — it is "not_assessed".
 *
 * This used to be decided by each screen. Unscored rows fell back to the raw
 * facilities_verify / products_verify.approval_status column, which the app
 * never writes and seed data preloads with "approved"; the Facilities page
 * badged those rows "approved" while its own card counted only
 * "importer_approved" (0), and the dashboard tile counted both (2). Three
 * readings of one fact. Every screen now reads these helpers instead.
 *
 * Pure — no database access — so client tables can import it.
 */

import type { StatusTone } from "@/types/platform";

export const NOT_ASSESSED = "not_assessed";

/** The top tier approval_thresholds resolves to. The only "approved". */
export const APPROVED = "importer_approved";

/** Assessed, and short of approval — what "Needing updates" counts. */
export const NEEDS_UPDATES: readonly string[] = [
  "conditionally_approved",
  "needs_corrective_action",
  "rejected",
  "not_approved",
];

export function isApproved(status: string | null | undefined): boolean {
  return status === APPROVED;
}

export function needsUpdates(status: string | null | undefined): boolean {
  return NEEDS_UPDATES.includes(status ?? "");
}

const LABELS: Record<string, string> = {
  importer_approved: "Approved",
  conditionally_approved: "Conditionally approved",
  needs_corrective_action: "Needs corrective action",
  rejected: "Rejected",
  not_approved: "Not approved",
  not_assessed: "Not assessed",
};

export function approvalLabel(status: string | null | undefined): string {
  const key = status ?? NOT_ASSESSED;
  return LABELS[key] ?? key.replace(/_/g, " ");
}

/**
 * The same tiers read as a document score, for a PRODUCT seen without its FSVP
 * record — the exporter's own product list. There, "Approved" would claim an
 * importer decision nobody has made; the importer's view shows the FSVP
 * standing instead (components/products/ProductStandings.tsx).
 */
const EVIDENCE_SCORE_LABELS: Record<string, string> = {
  importer_approved: "Complete",
  conditionally_approved: "Mostly complete",
  needs_corrective_action: "Gaps",
  rejected: "Insufficient",
  not_approved: "Insufficient",
  not_assessed: "Not assessed",
};

export function evidenceScoreLabel(status: string | null | undefined): string {
  const key = status ?? NOT_ASSESSED;
  return EVIDENCE_SCORE_LABELS[key] ?? key.replace(/_/g, " ");
}

export function approvalTone(status: string | null | undefined): StatusTone {
  if (isApproved(status)) return "success";
  if (status === "conditionally_approved") return "warning";
  if (needsUpdates(status)) return "danger";
  return "neutral";
}
