/**
 * Which product records an importer may see.
 *
 * A product record belongs to one importer (products_verify.importer_id), or to
 * nobody yet when an exporter created it before any importer took it on. The
 * exporters an importer buys from are shared with other importers, so "every
 * product of my linked exporters" showed Vegan Meats eight of ThrushCross's
 * product records. An importer's product lists are therefore "filed for me, or
 * for nobody in particular" — the same rule documents follow, and the one
 * products_read enforces in the database since migration 031.
 *
 * Pages that read through the admin client bypass RLS, so each importer-scoped
 * product query applies this filter by hand.
 */
export function ownOrUnclaimedProducts(importerId: string): string {
  return `importer_id.eq.${importerId},importer_id.is.null`;
}
