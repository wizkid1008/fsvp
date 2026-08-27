/**
 * Why admissibility blocks a product, or does not.
 *
 * The roadmap sequences admissibility (Phase 2) before purchase orders
 * (Phase 3), so the thing this is ultimately meant to gate — PO approval —
 * does not exist yet. Rather than build determinations nothing enforces, it
 * gates PRODUCT approval now and moves when purchase orders land. The shape of
 * the answer does not change; only where it is asked.
 *
 * Mirrors lib/fsvp/gates.ts: every blocking reason at once, each phrased as
 * something a person can act on.
 */

type SupabaseLike = { from: (table: string) => any };

export type AdmissibilityBlock = {
  code:
    | "not_classified"
    | "no_origin"
    | "determination_missing"
    | "awaiting_reference_rule"
    | "determination_unavailable"
    | "determination_expired"
    | "rule_superseded"
    | "prohibited";
  message: string;
};

export type AdmissibilityContext = {
  productId: string;
  commodityId: string | null;
  countryOfOrigin: string | null;
};

/**
 * Both soft codes mean "not answered yet" rather than "answered, and the answer
 * is no". Neither stops a file being built; the difference between them is only
 * WHO is being waited on, which matters to the screens that hand out work.
 */
export function isHardAdmissibilityBlock(block: AdmissibilityBlock): boolean {
  return block.code !== "determination_missing" && block.code !== "awaiting_reference_rule";
}

export function hardAdmissibilityBlocks(blocks: AdmissibilityBlock[]): AdmissibilityBlock[] {
  return blocks.filter(isHardAdmissibilityBlock);
}

/**
 * A prohibited outcome blocks. A RESTRICTED one does not — restricted means
 * entry is allowed subject to conditions, and the conditions are recorded on
 * the determination for whoever assembles the shipment. Treating restricted as
 * a block would stop most legitimate produce imports, which would teach people
 * to route around the gate.
 */
export async function evaluateAdmissibility(
  supabase: SupabaseLike,
  ctx: AdmissibilityContext
): Promise<AdmissibilityBlock[]> {
  const blocks: AdmissibilityBlock[] = [];

  if (!ctx.commodityId) {
    blocks.push({
      code: "not_classified",
      message:
        "This product is not linked to the commodity taxonomy, so its admissibility cannot be " +
        "determined. Classify it first.",
    });
  }
  if (!ctx.countryOfOrigin) {
    blocks.push({
      code: "no_origin",
      message:
        "This product has no country of origin recorded. Admissibility depends on where a " +
        "commodity comes from, so it cannot be determined without one.",
    });
  }
  if (blocks.length > 0) return blocks;

  const { data: rows, error } = await (supabase.from("admissibility_determinations_status") as any)
    .select("id, outcome, expires_at, is_current, rule_superseded, citation, intended_use, processing_state")
    .eq("product_id", ctx.productId)
    .is("superseded_at", null);

  if (error) {
    return [{
      code: "determination_unavailable",
      message:
        "The admissibility record could not be read, so this product cannot be treated as ready. " +
        "Restore access to the determination data and check again.",
    }];
  }

  const determinations = (rows ?? []) as Array<{
    id: string;
    outcome: "permitted" | "restricted" | "prohibited";
    expires_at: string;
    is_current: boolean;
    rule_superseded: boolean;
    citation: string;
    intended_use: string;
    processing_state: string;
  }>;

  if (determinations.length === 0) {
    // Nothing determined — but there are two reasons for that, and telling them
    // apart decides who gets handed the work.
    //
    // If the reference layer holds no rule for this commodity, the importer
    // cannot determine anything: the resolver has nothing to resolve against
    // and the product page no longer offers the button. Saying "determine
    // admissibility" to them would name an action they cannot take, which is
    // the dead end this codebase keeps having to undo. The outstanding work is
    // an administrator's.
    const { count, error: ruleError } = await (supabase.from("country_commodity_rules") as any)
      .select("id", { count: "exact", head: true })
      .eq("commodity_id", ctx.commodityId)
      .is("superseded_at", null);

    // Only a confirmed zero reassigns the work. If the count could not be read
    // we do not know whose turn it is, and telling the importer to wait on an
    // administrator who has nothing to do would be worse than asking them to
    // try — the try at least produces a real error.
    if (!ruleError && count === 0) {
      return [{
        code: "awaiting_reference_rule",
        message:
          "No country-commodity rule is on file for this commodity, so admissibility cannot be " +
          "determined yet. A platform administrator adds the rule after checking APHIS ACIR. " +
          "This does not stop the rest of the file — admissibility is required before the food " +
          "enters, not before the record is built.",
      }];
    }

    return [{
      code: "determination_missing",
      message:
        "No admissibility determination has been made for this product. Whether a commodity may " +
        "enter from a given origin is a question that has to be answered before the product is " +
        "approved, not at the border.",
    }];
  }

  for (const d of determinations) {
    const scope = `${d.intended_use.replace(/_/g, " ")}, ${d.processing_state}`;

    if (d.outcome === "prohibited") {
      blocks.push({
        code: "prohibited",
        message:
          `This commodity is prohibited from this origin for ${scope} under ${d.citation}. ` +
          `A prohibited movement cannot be approved — it is refused at entry.`,
      });
      continue;
    }

    if (!d.is_current) {
      blocks.push({
        code: "determination_expired",
        message:
          `The admissibility determination for ${scope} expired on ${d.expires_at}. Admissibility ` +
          `rules change, so a lapsed determination is a statement about a rule that may since have ` +
          `moved. Make a current one.`,
      });
      continue;
    }

    // Not expired, but the ground moved: the rule it rests on has been
    // replaced. The determination may still be right; it no longer reflects
    // what the reference layer says.
    if (d.rule_superseded) {
      blocks.push({
        code: "rule_superseded",
        message:
          `The country-commodity rule behind the determination for ${scope} has been superseded ` +
          `since it was made. Re-determine so the record reflects the rule now in force.`,
      });
    }
  }

  return blocks;
}
