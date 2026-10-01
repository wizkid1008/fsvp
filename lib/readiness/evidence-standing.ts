/**
 * Where a product stands from its exporter's side: what the exporter owes.
 *
 * The importer's Products list shows an FSVP status and a next step from the
 * planner (lib/setup/fsvp-workflow.ts). The exporter cannot see that planner's
 * inputs — determinations, attestations, approval decisions are the importer's
 * — and most of it is not theirs to act on anyway. What IS theirs is the
 * evidence, so this is the same idea, the same shape on screen, built from the
 * one thing the exporter can do something about.
 *
 * One standing per product, by what most needs the exporter: something sent
 * back outranks something missing, which outranks waiting on the importer.
 */

import type { EvidenceProgress } from "./evidence-scope";

export type EvidenceStanding = "returned" | "missing" | "awaiting" | "complete" | "none";

export const EVIDENCE_STANDING_LABEL: Record<EvidenceStanding, string> = {
  returned: "Sent back to you",
  missing: "Documents missing",
  awaiting: "Awaiting importer review",
  complete: "All accepted",
  none: "Nothing required",
};

export function evidenceStanding(progress: EvidenceProgress | undefined): EvidenceStanding {
  if (!progress || progress.required === 0) return "none";
  if (progress.needsAttention > 0) return "returned";
  if (progress.missing > 0) return "missing";
  if (progress.awaitingReview > 0) return "awaiting";
  return "complete";
}

/**
 * The exporter's next step for one product, as a short instruction, or null
 * when there is nothing for them to do. Waiting on the importer is not the
 * exporter's step, so it is null too — the status already says so.
 */
export function evidenceNextStep(progress: EvidenceProgress | undefined): string | null {
  switch (evidenceStanding(progress)) {
    case "returned":
      return `Fix ${progress!.needsAttention} sent back`;
    case "missing":
      return `Upload ${progress!.missing} missing`;
    default:
      return null;
  }
}

export type EvidenceCounts = {
  total: number;
  returned: number;
  missing: number;
  awaiting: number;
  complete: number;
};

/** Counts for the exporter's count cards — one bucket per product. */
export function countEvidenceStandings(progresses: Array<EvidenceProgress | undefined>): EvidenceCounts {
  const counts: EvidenceCounts = { total: progresses.length, returned: 0, missing: 0, awaiting: 0, complete: 0 };
  for (const p of progresses) {
    const standing = evidenceStanding(p);
    if (standing !== "none") counts[standing] += 1;
  }
  return counts;
}

/** Badge colour per standing: red for something to fix, green when done. */
export const EVIDENCE_STANDING_TONE: Record<EvidenceStanding, "danger" | "warning" | "info" | "success" | "neutral"> = {
  returned: "danger",
  missing: "warning",
  awaiting: "info",
  complete: "success",
  none: "neutral",
};

/**
 * One document's bucket on My Evidence — the per-document counterpart of
 * evidenceStanding, for the same count cards. "expiring" is an accepted
 * document that lapses within the window (or already has): accepted, but
 * about to stop counting.
 */
export type DocumentBucket = "returned" | "awaiting" | "expiring" | "accepted" | "other";

export const DOCUMENT_EXPIRY_WINDOW_DAYS = 60;

export function documentBucket(
  doc: { evidence_status: string | null; expiration_date: string | null },
  today: string = new Date().toISOString().slice(0, 10)
): DocumentBucket {
  const status = doc.evidence_status;
  if (status === "needs_revision" || status === "rejected") return "returned";
  if (status === "submitted" || status === "under_review") return "awaiting";
  if (status === "accepted") {
    if (doc.expiration_date) {
      const horizon = new Date(new Date(`${today}T00:00:00Z`).getTime() + DOCUMENT_EXPIRY_WINDOW_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10);
      if (doc.expiration_date.slice(0, 10) <= horizon) return "expiring";
    }
    return "accepted";
  }
  return "other";
}
