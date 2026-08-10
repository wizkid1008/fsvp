/**
 * The blocking conditions that are not about evidence or signatures.
 *
 * The § 1.503 signature gate lives in ./qi-attestation and the applicability
 * gate in ./applicability. This module holds the three added by migration 010,
 * each of which existed in the schema as a word the platform never read:
 *
 *   - A SUSPENDED supplier could still have their record approved.
 *   - A § 1.506(d) verification determination was free text, so "the importer
 *     determined which activities were appropriate" could not be checked.
 *   - A § 1.507 written assurance could lapse with nothing noticing, leaving
 *     the importer relying on a promise that expired last year.
 *
 * Shared between the approve route and the record page so both give the same
 * answer. A gate the UI does not show is a gate the user hits by surprise, and
 * a gate only the UI shows is not a gate at all.
 */

import { assuranceBlock, type AssuranceRow } from "./assurances";

type SupabaseLike = { from: (table: string) => any };

export type GateBlock = {
  /** Stable key for tests and telemetry. */
  code:
    | "supplier_suspended"
    | "verification_determination_missing"
    | "verification_determination_stale"
    | "sahcodha_audit_unjustified"
    | "assurance_expired";
  /** Shown to the user verbatim. */
  message: string;
};

export type GateContext = {
  importerId: string;
  supplierId: string;
  fsvpRecordId: string;
  /** From the applicability determination; decides which gates apply. */
  outcome: "in_scope" | "modified" | "exempt" | null;
};

/**
 * Every reason these three gates block, or an empty array.
 *
 * Returns all of them rather than the first: an importer fixing one blocker at
 * a time, discovering the next only after resubmitting, is how a compliance
 * queue turns into a war of attrition.
 */
export async function evaluateGates(
  supabase: SupabaseLike,
  ctx: GateContext
): Promise<GateBlock[]> {
  const blocks: GateBlock[] = [];

  const [{ data: suspension }, { data: determination }, { data: assurances }] = await Promise.all([
    (supabase.from("supplier_suspensions") as any)
      .select("basis, reason, suspended_at")
      .eq("importer_id", ctx.importerId)
      .eq("supplier_id", ctx.supplierId)
      .is("lifted_at", null)
      .maybeSingle(),

    (supabase.from("verification_determinations") as any)
      .select(
        "id, activities, sahcodha_hazard_present, controlled_by_foreign_supplier, " +
        "annual_onsite_audit_performed, alternative_justification, determined_at"
      )
      .eq("fsvp_record_id", ctx.fsvpRecordId)
      .is("superseded_at", null)
      .maybeSingle(),

    (supabase.from("written_assurances") as any)
      .select("category, expires_at, superseded_at")
      .eq("fsvp_record_id", ctx.fsvpRecordId)
      .is("superseded_at", null),
  ]);

  // ── Suspension ───────────────────────────────────────────────────────────
  // Applies whatever the applicability outcome: suspending a supplier and then
  // approving their record the same day is incoherent regardless of which
  // requirements the food is subject to.
  if (suspension) {
    blocks.push({
      code: "supplier_suspended",
      message:
        `This supplier is suspended (${String(suspension.basis).replace(/_/g, " ")}): ` +
        `${suspension.reason} Lift the suspension, with a reason, before approving anything for them.`,
    });
  }

  // ── § 1.506(d) determination ─────────────────────────────────────────────
  // Required for foods subject to the full requirements. § 1.512 replaces this
  // work with written assurance for modified-requirement records, and an exempt
  // food should not have a record at all.
  if (ctx.outcome === "in_scope") {
    if (!determination) {
      blocks.push({
        code: "verification_determination_missing",
        message:
          "21 CFR 1.506(d)(1)(i) requires you to determine and document which supplier verification " +
          "activities are needed, and why. No determination has been recorded for this record.",
      });
    } else if (
      determination.sahcodha_hazard_present &&
      determination.controlled_by_foreign_supplier &&
      !determination.annual_onsite_audit_performed &&
      !String(determination.alternative_justification ?? "").trim()
    ) {
      // The database refuses to store this combination, so reaching it means a
      // row predates the trigger. Checked anyway rather than assumed away.
      blocks.push({
        code: "sahcodha_audit_unjustified",
        message:
          "21 CFR 1.506(d)(2): this supplier controls a hazard with a reasonable probability of " +
          "serious adverse health consequences or death. Record the annual onsite audit, or an " +
          "adequate written determination that other verification activities are appropriate.",
      });
    }
  }

  // ── § 1.507 assurances ───────────────────────────────────────────────────
  const assuranceMessage = assuranceBlock((assurances ?? []) as AssuranceRow[]);
  if (assuranceMessage) {
    blocks.push({ code: "assurance_expired", message: assuranceMessage });
  }

  return blocks;
}

/**
 * The live suspension for a supplier in one tenant, or null.
 *
 * Separate from evaluateGates because the supplier list and the supplier page
 * need the suspension itself, not a blocking message about it.
 */
export async function fetchSuspension(
  supabase: SupabaseLike,
  importerId: string,
  supplierId: string
): Promise<{ basis: string; reason: string; suspended_at: string } | null> {
  const { data } = await (supabase.from("supplier_suspensions") as any)
    .select("basis, reason, suspended_at")
    .eq("importer_id", importerId)
    .eq("supplier_id", supplierId)
    .is("lifted_at", null)
    .maybeSingle();

  return data ?? null;
}

export const SUSPENSION_BASES = [
  { basis: "verification_failure",   label: "Verification activity unacceptable" },
  { basis: "corrective_action_open", label: "Corrective action unresolved" },
  { basis: "regulatory_finding",     label: "FDA compliance finding" },
  { basis: "evidence_lapsed",        label: "Required records lapsed" },
  { basis: "commercial",             label: "Commercial decision" },
  { basis: "other",                  label: "Other" },
] as const;

export function isSuspensionBasis(v: unknown): boolean {
  return SUSPENSION_BASES.some((b) => b.basis === v);
}
