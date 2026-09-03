import { describe, expect, it } from "vitest";
import {
  acceptedCount,
  bestStatus,
  isRelationshipScoped,
  statusesByItem,
  type ScopedDocument,
  type ScopedItem,
} from "./evidence-scope";

const POLICY: ScopedItem = { id: "item-policy", evidence_scope: "entity" };
const ASSURANCE: ScopedItem = { id: "item-assurance", evidence_scope: "importer_relationship" };
/** Rule versions predating migration 028 carry no column at all. */
const LEGACY: ScopedItem = { id: "item-legacy" };

const ITEMS = [POLICY, ASSURANCE, LEGACY];

function doc(
  requirement_item_id: string,
  evidence_status: string,
  importer_id: string | null = null
): ScopedDocument {
  return { requirement_item_id, evidence_status, importer_id };
}

describe("isRelationshipScoped", () => {
  it("treats a missing scope as entity, so pre-028 versions keep working", () => {
    expect(isRelationshipScoped(LEGACY)).toBe(false);
    expect(isRelationshipScoped(POLICY)).toBe(false);
    expect(isRelationshipScoped(ASSURANCE)).toBe(true);
  });
});

describe("entity-scoped evidence", () => {
  it("counts for every importer, whoever filed it", () => {
    // The exporter's food safety policy is one document. Importer B should not
    // have to re-collect what importer A already gathered.
    const statuses = statusesByItem(ITEMS, [doc("item-policy", "accepted", "importer-a")], {
      kind: "importer",
      importerId: "importer-b",
    });
    expect(statuses.get("item-policy")).toEqual(["accepted"]);
  });

  it("counts even with no importer named at all", () => {
    const statuses = statusesByItem(ITEMS, [doc("item-policy", "accepted", null)], {
      kind: "importer",
      importerId: "importer-b",
    });
    expect(statuses.get("item-policy")).toEqual(["accepted"]);
  });
});

describe("relationship-scoped evidence, seen by an importer", () => {
  it("does NOT let one importer's assurance satisfy another's", () => {
    // The bug this whole change exists to close. written_assurances is a
    // critical blocker, so before 028 importer B's blocker cleared on the
    // strength of importer A's document.
    const statuses = statusesByItem(ITEMS, [doc("item-assurance", "accepted", "importer-a")], {
      kind: "importer",
      importerId: "importer-b",
    });
    expect(statuses.get("item-assurance") ?? []).not.toContain("accepted");
  });

  it("counts the importer's own assurance", () => {
    const statuses = statusesByItem(ITEMS, [doc("item-assurance", "accepted", "importer-a")], {
      kind: "importer",
      importerId: "importer-a",
    });
    expect(statuses.get("item-assurance")).toEqual(["accepted"]);
  });

  it("ignores an assurance that names no importer", () => {
    // A relationship document that names no relationship cannot prove one.
    const statuses = statusesByItem(ITEMS, [doc("item-assurance", "accepted", null)], {
      kind: "importer",
      importerId: "importer-a",
    });
    expect(statuses.get("item-assurance")).toBeUndefined();
  });

  it("keeps the two importers' documents apart when both exist", () => {
    const statuses = statusesByItem(
      ITEMS,
      [
        doc("item-assurance", "accepted", "importer-a"),
        doc("item-assurance", "rejected", "importer-b"),
      ],
      { kind: "importer", importerId: "importer-b" }
    );
    expect(statuses.get("item-assurance")).toEqual(["rejected"]);
  });
});

describe("relationship-scoped evidence, seen by the exporter", () => {
  it("is accepted only when every linked importer has one", () => {
    const statuses = statusesByItem(
      ITEMS,
      [
        doc("item-assurance", "accepted", "importer-a"),
        doc("item-assurance", "accepted", "importer-b"),
      ],
      { kind: "exporter", linkedImporterIds: ["importer-a", "importer-b"] }
    );
    expect(statuses.get("item-assurance")).toEqual(["accepted"]);
  });

  it("is not accepted when one importer is still missing", () => {
    // Three of five is not done, and a score saying otherwise is the same
    // false comfort this change removes.
    const statuses = statusesByItem(
      ITEMS,
      [doc("item-assurance", "accepted", "importer-a")],
      { kind: "exporter", linkedImporterIds: ["importer-a", "importer-b"] }
    );
    const result = statuses.get("item-assurance") ?? [];
    expect(result).not.toContain("accepted");
    expect(bestStatus(result)).toBe("not_submitted");
  });

  it("reports the most favourable status among the outstanding relationships", () => {
    const statuses = statusesByItem(
      ITEMS,
      [
        doc("item-assurance", "accepted", "importer-a"),
        doc("item-assurance", "under_review", "importer-b"),
        doc("item-assurance", "rejected", "importer-c"),
      ],
      { kind: "exporter", linkedImporterIds: ["importer-a", "importer-b", "importer-c"] }
    );
    // "accepted" dropped so the item cannot read as done; of what is left,
    // under_review is the furthest along.
    expect(bestStatus(statuses.get("item-assurance") ?? [])).toBe("under_review");
  });

  it("treats the item as met when the exporter has no importers yet", () => {
    // There is no counterparty to owe an assurance to. Leaving it unmet would
    // cap an unlinked exporter below 100 for an obligation that does not exist.
    const statuses = statusesByItem(ITEMS, [], { kind: "exporter", linkedImporterIds: [] });
    expect(statuses.get("item-assurance")).toEqual(["accepted"]);
  });
});

describe("bestStatus", () => {
  it("ranks accepted above everything and defaults to not_submitted", () => {
    expect(bestStatus(["rejected", "accepted"])).toBe("accepted");
    expect(bestStatus(["rejected", "submitted"])).toBe("submitted");
    expect(bestStatus([])).toBe("not_submitted");
    expect(bestStatus(["something_unknown"])).toBe("not_submitted");
  });
});

describe("acceptedCount", () => {
  it("counts only items with an accepted status", () => {
    const statuses = statusesByItem(
      ITEMS,
      [doc("item-policy", "accepted"), doc("item-legacy", "submitted")],
      { kind: "importer", importerId: "importer-a" }
    );
    expect(acceptedCount(ITEMS, statuses)).toBe(1);
  });
});
