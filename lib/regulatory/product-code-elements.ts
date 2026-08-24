/**
 * Names for the container element of an FDA food product code.
 *
 * WHY THIS EXISTS AND WHAT IT DELIBERATELY OMITS
 *
 * FDA's /subclass, /pic, /industrysubclass/{id} and /industrypic/{id} tables
 * have not answered for us, so the picker derives its options from the codes
 * FDA does return and shows them as bare letters. A letter names nothing, so
 * the container table is carried here instead.
 *
 * SUBCLASS ONLY. For industry codes 02-50 the subclass is the container — the
 * material that holds or contacts the food — and it is one table across those
 * industries, so naming it here is a taxonomy fact rather than a guess.
 *
 * PIC IS ABSENT ON PURPOSE. FDA's process codes are defined PER INDUSTRY: the
 * set published for edible insects is not the set published for veterinary
 * products, and neither covers the W, X and U that industry 34 actually
 * returns. Seeding a general list would put a confident wrong name on a real
 * code — the failure this client's header warns about, one element over. PIC
 * stays a bare letter until FDA's own table for the industry can be read.
 *
 * Checked against FDA's worked example, 38BEE27: subclass E is METAL, the can.
 * Industry 34's own codes read consistently too — 34BAU04 is cocoa in a fabric
 * sack, 34BGW04 the same product in a plastic bag.
 *
 * Sources: CBP CSMS# 16-000549 (FDA addition of PIC and subclass codes) and
 * FDA's published subclass definitions.
 */

/** Container material, for food industry codes 02-50. */
export const SUBCLASS_NAMES: Record<string, string> = {
  A: "Fabric or textile bag (burlap, sacking, casing)",
  B: "Ceramic or earthenware",
  C: "Glass",
  D: "Laminated (bonded layers, e.g. paper and foil)",
  E: "Metal (aluminium, tin, steel)",
  F: "Paper or fiberboard",
  G: "Flexible plastic (bags, pouches, wrappers)",
  H: "Rigid or semi-rigid plastic",
  J: "Wood",
  M: "Multiple container materials",
  V: "Vacuum or modified atmosphere",
  W: "Wax coating",
  Y: "Not elsewhere classified",
};

/**
 * The container name for a subclass letter, or null when FDA's table does not
 * define one. Null rather than the letter again: the caller shows the letter
 * regardless, and echoing it as its own description would claim a meaning
 * that is not there.
 */
export function subclassName(code: string | null | undefined): string | null {
  const key = code?.trim().toUpperCase() ?? "";
  return SUBCLASS_NAMES[key] ?? null;
}
