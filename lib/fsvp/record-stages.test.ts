import { describe, expect, it } from "vitest";
import {
  RECORD_STAGES,
  isBlocked,
  recordProgress,
  stageIndexFor,
  summariseStages,
} from "./record-stages";

describe("recordProgress", () => {
  it("places a new record at the start of the track", () => {
    const p = recordProgress("draft");
    expect(p.stageIndex).toBe(0);
    expect(p.stageLabel).toBe("Evidence collection");
    expect(p.blocked).toBe(false);
  });

  it("fills the bar completely for an approved record", () => {
    expect(recordProgress("importer_approved").fraction).toBe(1);
    expect(recordProgress("conditionally_approved").fraction).toBe(1);
  });

  it("advances monotonically along the track", () => {
    const order = [
      "draft",
      "supplier_evidence_submitted",
      "importer_review_pending",
      "importer_approved",
    ];
    const fractions = order.map((s) => recordProgress(s).fraction);
    for (let i = 1; i < fractions.length; i += 1) {
      expect(fractions[i]).toBeGreaterThan(fractions[i - 1]);
    }
  });

  it("treats blocked as a flag, not as the earliest stage", () => {
    // The kanban put blocked first, which reads as "not started". A rejected
    // record has been all the way through — claiming stage zero for it would
    // state the opposite of what happened.
    for (const status of ["needs_corrective_action", "rejected", "expired"]) {
      const p = recordProgress(status);
      expect(p.blocked).toBe(true);
      expect(p.stageLabel).toBe("Blocked");
      expect(p.fraction).toBe(0);
    }
  });

  it("starts an unrecognised status at the beginning rather than blocked", () => {
    const p = recordProgress("something_new");
    expect(p.blocked).toBe(false);
    expect(p.stageIndex).toBe(0);
  });

  it("reports the track length so a bar can render segments", () => {
    expect(recordProgress("draft").totalStages).toBe(RECORD_STAGES.length);
  });
});

describe("stageIndexFor / isBlocked", () => {
  it("never returns a blocked status as a stage member", () => {
    for (const stage of RECORD_STAGES) {
      for (const status of stage.statuses) expect(isBlocked(status)).toBe(false);
    }
  });

  it("gives every stage at least one status", () => {
    for (const stage of RECORD_STAGES) expect(stage.statuses.length).toBeGreaterThan(0);
  });

  it("maps each stage's own statuses back to that stage", () => {
    RECORD_STAGES.forEach((stage, i) => {
      for (const status of stage.statuses) expect(stageIndexFor(status)).toBe(i);
    });
  });
});

describe("summariseStages", () => {
  const rows = (...statuses: string[]) => statuses.map((status) => ({ status }));

  it("counts an empty programme as zero rather than dividing by it", () => {
    const s = summariseStages([]);
    expect(s.total).toBe(0);
    expect(s.fraction).toBe(0);
    expect(s.byStage.every((n) => n === 0)).toBe(true);
  });

  it("keeps blocked records out of the stage counts", () => {
    // Absorbing them into a stage would show a record as progressing when it
    // is the one thing on the board that is not.
    const s = summariseStages(rows("draft", "draft", "rejected"));
    expect(s.blocked).toBe(1);
    expect(s.byStage.reduce((a, b) => a + b, 0)).toBe(2);
    expect(s.total).toBe(3);
  });

  it("counts only the final stage as approved", () => {
    const s = summariseStages(rows("importer_approved", "importer_review_pending", "draft"));
    expect(s.approved).toBe(1);
    expect(s.fraction).toBeCloseTo(1 / 3);
  });

  it("counts blocked records against completion", () => {
    const s = summariseStages(rows("importer_approved", "rejected"));
    expect(s.fraction).toBe(0.5);
  });

  it("returns one count per stage so a stacked bar can render directly", () => {
    expect(summariseStages([]).byStage).toHaveLength(RECORD_STAGES.length);
  });
});
