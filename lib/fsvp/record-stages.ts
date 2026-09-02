/**
 * Where an FSVP record has got to, as a position on a track.
 *
 * The kanban in FsvpProcessFlow carried this as five columns with `blocked`
 * first. That works as a board and fails as progress: blocked is not the
 * earliest stage a record can be at, it is something that has happened to a
 * record at whatever stage it reached. Put first in an ordered list it reads
 * as "not started yet", which is the opposite of what it means — a rejected
 * record has been all the way through.
 *
 * So the track is the four stages a record actually moves along, and blocked
 * is a flag on top of it. A blocked record keeps no meaningful position (the
 * status does not record which stage it fell out of), so it is shown as
 * blocked rather than as a fraction, and shown first because it is the one
 * needing a person.
 *
 * Stage names track the canonical path in lib/setup/fsvp-steps.ts, so a
 * record's position means the same thing here as it does on /setup/fsvp.
 */

import type { FsvpRecordStatus } from "@/types/database";

export const RECORD_STAGES = [
  {
    key: "evidence",
    label: "Evidence collection",
    statuses: ["draft", "awaiting_supplier_evidence"],
  },
  {
    key: "submitted",
    label: "Submitted for review",
    statuses: ["supplier_evidence_submitted", "supplier_evidence_accepted"],
  },
  {
    key: "review",
    label: "Importer review",
    statuses: ["importer_review_pending"],
  },
  {
    key: "approved",
    label: "Approved & monitoring",
    statuses: ["importer_approved", "conditionally_approved", "reassessment_due"],
  },
] as const;

/** Not a stage. Something that has happened to a record at any stage. */
export const BLOCKED_STATUSES = ["needs_corrective_action", "rejected", "expired"] as const;

/** Unrecognised statuses start at the beginning, never at blocked. */
const DEFAULT_STAGE_INDEX = 0;

export type RecordProgress = {
  /** 0-based position on the track. Meaningless when `blocked`. */
  stageIndex: number;
  stageLabel: string;
  totalStages: number;
  blocked: boolean;
  /** How far along, 0..1 — for a bar. A blocked record reports 0. */
  fraction: number;
};

export function isBlocked(status: string): boolean {
  return (BLOCKED_STATUSES as readonly string[]).includes(status);
}

export function stageIndexFor(status: string): number {
  const index = RECORD_STAGES.findIndex((s) => (s.statuses as readonly string[]).includes(status));
  return index === -1 ? DEFAULT_STAGE_INDEX : index;
}

export function recordProgress(status: FsvpRecordStatus | string): RecordProgress {
  const blocked = isBlocked(status);
  const stageIndex = stageIndexFor(status);

  return {
    stageIndex,
    // A blocked record's stage label would claim a position it does not have.
    stageLabel: blocked ? "Blocked" : RECORD_STAGES[stageIndex].label,
    totalStages: RECORD_STAGES.length,
    blocked,
    // Reaching a stage means that stage is underway, so the bar fills through
    // it rather than stopping at its start — a record in the final stage reads
    // as complete, which it is.
    fraction: blocked ? 0 : (stageIndex + 1) / RECORD_STAGES.length,
  };
}

export type StageSummary = {
  total: number;
  blocked: number;
  /** One count per entry in RECORD_STAGES, blocked records excluded. */
  byStage: number[];
  /** Records that have reached the final stage. */
  approved: number;
  /** Share of records fully through the track, 0..1. Blocked count against. */
  fraction: number;
};

/**
 * The whole programme as one line.
 *
 * Blocked records are excluded from the stage counts and counted separately,
 * so the stage columns sum to `total - blocked` rather than quietly absorbing
 * records that are not progressing at all.
 */
export function summariseStages(records: Array<{ status: FsvpRecordStatus | string }>): StageSummary {
  const byStage = RECORD_STAGES.map(() => 0);
  let blocked = 0;

  for (const record of records) {
    if (isBlocked(record.status)) {
      blocked += 1;
      continue;
    }
    byStage[stageIndexFor(record.status)] += 1;
  }

  const approved = byStage[RECORD_STAGES.length - 1];

  return {
    total: records.length,
    blocked,
    byStage,
    approved,
    fraction: records.length === 0 ? 0 : approved / records.length,
  };
}
