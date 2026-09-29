import type { StatusTone } from "@/types/platform";

/**
 * How a document's evidence_status reads on a badge. Shared by the checklist's
 * required rows (RequirementItemRow, a client component) and its "Other
 * documents" list (rendered on the server), so one status never wears two
 * labels on one page.
 */
export function documentTone(status: string | null | undefined): StatusTone {
  if (status === "accepted") return "success";
  if (status === "under_review") return "info";
  if (status === "submitted" || status === "in_progress") return "warning";
  if (status === "needs_revision" || status === "rejected") return "danger";
  return "neutral";
}

export function documentLabel(status: string | null | undefined): string {
  const value = status ?? "submitted";
  if (value === "not_submitted") return "Missing";
  if (value === "in_progress") return "In Progress";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
