/**
 * Who may write a facility or product belonging to a given supplier.
 *
 * This was inline in two API routes and they did not agree.
 * app/api/products/save/route.ts handled importers; app/api/facilities/route.ts
 * did not, and its check was written as:
 *
 *     if (sid === ownSupplierId) continue;
 *     ... .eq("exporter_id", ownSupplierId)
 *         .in("relationship_type", ["exporter_supplier", "self_supply"])
 *
 * An importer has no profiles.supplier_id, so ownSupplierId was null: the skip
 * never matched a real uuid, the query ran as `exporter_id = null` which matches
 * no row in SQL, and importer_supplier links were never consulted at all. Every
 * facility a US importer tried to create was rejected with a 403, and since a
 * product requires a facility, products were blocked too.
 *
 * The bug was invisible because the decision was tangled up with the Supabase
 * calls, so nothing could test it. Deciding here — on plain data a caller has
 * already fetched — is what makes the table of cases in entity-access.test.ts
 * possible.
 */

import { isCrossTenant } from "./tenancy";

/** A pending invite still counts: an importer maintains records for an
 *  exporter that has not registered, which is the point of a managed record. */
export const ACTIVE_LINK_STATUSES = ["active", "pending_invite"] as const;

/** The exporter→upstream-supplier relationship types. */
export const EXPORTER_LINK_TYPES = ["exporter_supplier", "self_supply"] as const;

export type ActorProfile = {
  role: string;
  supplier_id: string | null;
  importer_id: string | null;
};

/** One `supplier_relationships` row, narrowed to the columns that decide access. */
export type SupplierLink = {
  relationship_type: string;
  status: string;
  supplier_id: string | null;
  exporter_id?: string | null;
  importer_id?: string | null;
};

export type AccessReason =
  | "platform_wide"
  | "own_supplier"
  | "exporter_link"
  | "importer_link";

export type AccessDecision =
  | { allowed: true; reason: AccessReason }
  | { allowed: false; reason: "no_link" };

function isLive(link: SupplierLink): boolean {
  return (ACTIVE_LINK_STATUSES as readonly string[]).includes(link.status);
}

/**
 * Decide whether `profile` may create or edit records under `supplierId`.
 *
 * `links` is every supplier_relationships row the caller fetched for this
 * request. Rows for other suppliers are ignored, so one query covering all
 * requested supplier ids can be passed in unfiltered.
 */
export function decideSupplierEntityAccess(
  profile: ActorProfile,
  supplierId: string,
  links: SupplierLink[]
): AccessDecision {
  if (isCrossTenant(profile)) return { allowed: true, reason: "platform_wide" };

  // A supplier or exporter acting on its own record.
  if (profile.supplier_id && profile.supplier_id === supplierId) {
    return { allowed: true, reason: "own_supplier" };
  }

  const relevant = links.filter((link) => link.supplier_id === supplierId && isLive(link));

  // An exporter acting for one of its own upstream suppliers.
  if (profile.supplier_id) {
    const viaExporter = relevant.some(
      (link) =>
        (EXPORTER_LINK_TYPES as readonly string[]).includes(link.relationship_type) &&
        link.exporter_id === profile.supplier_id
    );
    if (viaExporter) return { allowed: true, reason: "exporter_link" };
  }

  // An importer acting for an exporter it has linked or created.
  if (profile.importer_id) {
    const viaImporter = relevant.some(
      (link) =>
        link.relationship_type === "importer_supplier" &&
        link.importer_id === profile.importer_id
    );
    if (viaImporter) return { allowed: true, reason: "importer_link" };
  }

  return { allowed: false, reason: "no_link" };
}

/** Convenience wrapper for callers that only need the boolean. */
export function canWriteSupplierEntity(
  profile: ActorProfile,
  supplierId: string,
  links: SupplierLink[]
): boolean {
  return decideSupplierEntityAccess(profile, supplierId, links).allowed;
}

/** The first supplier id this actor may NOT write, or null if all are allowed. */
export function firstDeniedSupplierId(
  profile: ActorProfile,
  supplierIds: string[],
  links: SupplierLink[]
): string | null {
  return supplierIds.find((id) => !canWriteSupplierEntity(profile, id, links)) ?? null;
}
