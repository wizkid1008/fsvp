/**
 * The blocking conditions that are not about evidence or signatures.
 *
 * The § 1.503 signature gate lives in ./qi-attestation and the applicability
 * gate in ./applicability. This module holds the rest, each of which existed as
 * something the platform recorded and never read:
 *
 *   - A SUSPENDED supplier could still have their record approved.
 *   - A § 1.506(d) verification determination was free text, so "the importer
 *     determined which activities were appropriate" could not be checked.
 *   - A § 1.507 written assurance could lapse with nothing noticing, leaving
 *     the importer relying on a promise that expired last year.
 *   - A § 1.505(a)(1)(iv) compliance history screening could be absent or years
 *     stale. This is the third condition of the roadmap's Phase 1 exit
 *     criterion, and the last one to be enforced rather than merely stored.
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
    | "assurance_expired"
    | "compliance_screening_missing"
    | "compliance_screening_expired"
    | "compliance_screening_blocking";
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
 * Every reason these gates block, or an empty array.
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

  const [{ data: suspension }, { data: determination }, { data: assurances }, { data: screening }] =
    await Promise.all([
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

    // Scoped to the supplier, not the record: § 1.505 evaluates the FOREIGN
    // SUPPLIER, so one screening covers every food imported from them rather
    // than being repeated per product.
    (supabase.from("supplier_compliance_screenings") as any)
      .select("id, conclusion, expires_at, screened_at")
      .eq("importer_id", ctx.importerId)
      .eq("supplier_id", ctx.supplierId)
      .is("superseded_at", null)
      .maybeSingle(),
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

  // ── § 1.505(a)(1)(iv) compliance history screening ───────────────────────
  //
  // This is the last of the three conditions in the Phase 1 exit criterion, and
  // the one that was recorded but never enforced. Holding FDA data is not the
  // same as having considered it: the platform can ingest every refusal FDA has
  // ever published and an importer who never opened the screen has still not
  // done what § 1.505(a)(1)(iv) asks.
  //
  // Required for in-scope foods only. § 1.512 replaces the supplier evaluation
  // with written assurance for modified-requirement records, so demanding a
  // § 1.505 screening there would be asking for work the regulation does not
  // require — the same reasoning as the § 1.506(d) gate above.
  if (ctx.outcome === "in_scope") {
    const today = new Date().toISOString().slice(0, 10);

    if (!screening) {
      blocks.push({
        code: "compliance_screening_missing",
        message:
          "21 CFR 1.505(a)(1)(iv) requires you to consider this supplier's FDA compliance history. " +
          "No screening has been recorded. A qualified individual records one on the Compliance " +
          "History screen.",
      });
    } else if (screening.expires_at && screening.expires_at < today) {
      blocks.push({
        code: "compliance_screening_expired",
        message:
          `The compliance history screening for this supplier expired on ${screening.expires_at}. ` +
          "FDA publishes new refusals, recalls and actions continuously, so a lapsed screen is a " +
          "statement about data that has since changed. Record a current one.",
      });
    } else if (screening.conclusion === "adverse_history_blocking") {
      blocks.push({
        code: "compliance_screening_blocking",
        message:
          "A qualified individual screened this supplier's FDA compliance history and concluded it " +
          "blocks approval. Resolve the findings and record a new screening, or suspend the supplier.",
      });
    }
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
