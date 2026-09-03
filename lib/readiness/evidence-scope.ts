/**
 * Which documents satisfy which requirement, once scope is taken into account.
 *
 * Migration 028 splits company-level requirements in two. Most describe the
 * COMPANY — its recall plan, its food safety policy — and one document answers
 * for every importer who looks. Two describe a RELATIONSHIP: written assurances
 * under 21 CFR 1.506(e)(2), and the importer acknowledgement that goes with
 * them. Those are agreements between two named parties, and only a document
 * filed for THIS importer answers for this importer.
 *
 * This module exists so that rule lives in one place. RequiredEvidenceChecklist
 * and lib/readiness/supplier-score.ts already read the same column deliberately,
 * so that a list and the number above it cannot disagree; splitting the rule
 * across both would be the same mistake in a new form.
 *
 * Pure — no database access — so the judgement can be tested directly.
 */

export const RELATIONSHIP_SCOPE = "importer_relationship";

export type ScopedItem = {
  id: string;
  /** Absent on rule versions predating 028; absent means entity-scoped. */
  evidence_scope?: string | null;
};

export type ScopedDocument = {
  requirement_item_id: string | null;
  evidence_status: string | null;
  /**
   * Null for an exporter's own upload when it serves several importers — the
   * upload route leaves it null rather than guessing. A relationship-scoped
   * requirement therefore cannot be satisfied by such a document, which is the
   * honest outcome: nobody can tell who the assurance was given to.
   */
  importer_id: string | null;
};

/**
 * Who is asking, which decides what a relationship-scoped item means.
 *
 * An importer asks about itself. An exporter has no single counterparty, so it
 * is asked about all of them at once — see allAccepted below for why that is
 * the fair reading rather than a convenient one.
 */
export type EvidenceViewer =
  | { kind: "importer"; importerId: string }
  | { kind: "exporter"; linkedImporterIds: string[] };

export function isRelationshipScoped(item: ScopedItem): boolean {
  return item.evidence_scope === RELATIONSHIP_SCOPE;
}

/** Ranked best-first. Shared with the checklist so both agree what "best" is. */
const STATUS_PRIORITY = [
  "accepted",
  "under_review",
  "submitted",
  "needs_revision",
  "rejected",
  "not_submitted",
] as const;

export function bestStatus(statuses: string[]): string {
  for (const candidate of STATUS_PRIORITY) {
    if (statuses.includes(candidate)) return candidate;
  }
  return "not_submitted";
}

/**
 * The evidence statuses that count toward each required item, for this viewer.
 *
 * Entity-scoped items collect every document filed against the entity, exactly
 * as before 028.
 *
 * Relationship-scoped items, seen by an IMPORTER, collect only documents filed
 * for that importer. A document with a null importer_id counts for nobody.
 *
 * Relationship-scoped items, seen by an EXPORTER, are reported as accepted only
 * when every importer it is actively linked to has an accepted document. An
 * exporter holding assurances with three of its five importers has not finished
 * that requirement, and a score saying otherwise would be the same false
 * comfort this whole change removes. With no linked importers the item is
 * treated as accepted: there is no counterparty to owe an assurance to, and
 * leaving it permanently unmet would cap an unlinked exporter's score below 100
 * for an obligation that does not yet exist.
 */
export function statusesByItem(
  items: ScopedItem[],
  documents: ScopedDocument[],
  viewer: EvidenceViewer
): Map<string, string[]> {
  const relationshipItemIds = new Set(
    items.filter(isRelationshipScoped).map((item) => item.id)
  );

  const entityStatuses = new Map<string, string[]>();
  // itemId -> importerId -> statuses, only for relationship-scoped items.
  const byImporter = new Map<string, Map<string, string[]>>();

  for (const doc of documents) {
    const itemId = doc.requirement_item_id;
    if (!itemId) continue;
    const status = doc.evidence_status ?? "not_submitted";

    if (!relationshipItemIds.has(itemId)) {
      const existing = entityStatuses.get(itemId) ?? [];
      existing.push(status);
      entityStatuses.set(itemId, existing);
      continue;
    }

    // A relationship document that names no importer names no relationship.
    if (!doc.importer_id) continue;

    const perImporter = byImporter.get(itemId) ?? new Map<string, string[]>();
    const existing = perImporter.get(doc.importer_id) ?? [];
    existing.push(status);
    perImporter.set(doc.importer_id, existing);
    byImporter.set(itemId, perImporter);
  }

  const out = new Map<string, string[]>(entityStatuses);

  for (const itemId of relationshipItemIds) {
    const perImporter = byImporter.get(itemId) ?? new Map<string, string[]>();

    if (viewer.kind === "importer") {
      const mine = perImporter.get(viewer.importerId);
      if (mine && mine.length > 0) out.set(itemId, mine);
      continue;
    }

    const importerIds = viewer.linkedImporterIds;
    if (importerIds.length === 0) {
      out.set(itemId, ["accepted"]);
      continue;
    }

    const perImporterBest = importerIds.map((id) =>
      bestStatus(perImporter.get(id) ?? [])
    );
    const allAccepted = perImporterBest.every((status) => status === "accepted");

    if (allAccepted) {
      out.set(itemId, ["accepted"]);
      continue;
    }

    // Accepted entries are dropped so bestStatus cannot report the whole item
    // as accepted on the strength of one importer's document while another
    // importer still has nothing. What remains is the most favourable status
    // among the relationships that are NOT yet done — which is what the
    // exporter still has to act on.
    const outstanding = perImporterBest.filter((status) => status !== "accepted");
    out.set(itemId, outstanding.length > 0 ? outstanding : ["not_submitted"]);
  }

  return out;
}

/**
 * How many of the required items are accepted, for this viewer.
 * Shared so the score and any "n of m" label are computed the same way.
 */
export function acceptedCount(
  requiredItems: ScopedItem[],
  statuses: Map<string, string[]>
): number {
  return requiredItems.filter((item) =>
    (statuses.get(item.id) ?? []).includes("accepted")
  ).length;
}
