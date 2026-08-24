/**
 * Which published rule version governs an FSVP record.
 *
 * `rule_sets.applies_to` already says what kind of thing a set is written for
 * — 'facility', 'product', 'fsvp_record' or 'all'. Nothing was reading it.
 * Both record-creation paths picked a version without it, in two different
 * and disagreeing ways:
 *
 *   - the hazard-analysis path took the highest version_number among ALL
 *     published versions, so once a second rule set existed, publishing v2 of
 *     a facility-scoped set would start attaching it to FSVP records;
 *   - the /api/fsvp-records path let the caller name any version and checked
 *     only that it was published, never that it was for FSVP records at all.
 *
 * Both are harmless while one seeded set exists ('FSVP Standard', applies_to
 * 'all') and become silent misattribution the day a second is published. A
 * rule version is what a record was judged against, so attaching the wrong
 * one is a records-integrity fault, not a display bug — it is worth spending
 * a query to be certain.
 *
 * Ambiguity is refused rather than guessed. If two published sets both claim
 * FSVP records there is no basis in the data for preferring either, and
 * picking by version number is arbitrary dressed as a rule.
 *
 * Takes the client as a parameter for the same reason applicability.ts does.
 */

type SupabaseLike = { from: (table: string) => any };

/** `applies_to` values whose rule sets can govern an FSVP record. */
const GOVERNING_SCOPES = ["fsvp_record", "all"] as const;

export type GoverningRuleVersion = {
  id: string;
  ruleSetId: string;
  versionNumber: number;
};

export type RuleVersionResult =
  | { ok: true; version: GoverningRuleVersion }
  | { ok: false; error: string };

/** The published rule version that governs FSVP records, or why there isn't one. */
export async function fetchGoverningRuleVersion(supabase: SupabaseLike): Promise<RuleVersionResult> {
  const { data } = await (supabase.from("rule_versions") as any)
    .select("id, version_number, rule_set_id, rule_sets!inner(applies_to)")
    .eq("status", "published")
    .in("rule_sets.applies_to", GOVERNING_SCOPES)
    .order("version_number", { ascending: false });

  const rows = (data ?? []) as Array<{
    id: string;
    version_number: number;
    rule_set_id: string;
  }>;

  if (rows.length === 0) {
    return {
      ok: false,
      error:
        "No published rule set governs FSVP records. An administrator must publish one before records can be opened.",
    };
  }

  const distinctSets = new Set(rows.map((row) => row.rule_set_id));
  if (distinctSets.size > 1) {
    return {
      ok: false,
      error:
        "More than one published rule set claims FSVP records, so which one governs is undefined. " +
        "An administrator must archive all but one.",
    };
  }

  const latest = rows[0];
  return {
    ok: true,
    version: {
      id: latest.id,
      ruleSetId: latest.rule_set_id,
      versionNumber: latest.version_number,
    },
  };
}

/**
 * Why a caller-supplied rule version cannot govern an FSVP record, or null if
 * it can.
 *
 * Separate from fetchGoverningRuleVersion because the two answer different
 * questions: this one validates a choice already made, and must not silently
 * substitute a different version for the one asked for.
 */
export async function ruleVersionBlock(
  supabase: SupabaseLike,
  ruleVersionId: string
): Promise<string | null> {
  const { data } = await (supabase.from("rule_versions") as any)
    .select("status, rule_sets!inner(applies_to)")
    .eq("id", ruleVersionId)
    .maybeSingle();

  if (!data) return "That rule version does not exist.";
  if (data.status !== "published") {
    return "rule_version_id must reference a published rule version.";
  }

  const appliesTo = data.rule_sets?.applies_to as string | undefined;
  if (!appliesTo || !GOVERNING_SCOPES.includes(appliesTo as (typeof GOVERNING_SCOPES)[number])) {
    return (
      `That rule version belongs to a rule set scoped to "${appliesTo ?? "unknown"}", ` +
      "which cannot govern an FSVP record."
    );
  }

  return null;
}
