/**
 * The daily pass that turns review_due_at into something an administrator sees.
 *
 * Selection logic lives in ./rule-review.ts and is pure, so the decision about
 * what counts as needing review is tested rather than inferred from behaviour.
 * This file is only the I/O around it.
 */

import { notifyPlatformAdmins } from "@/lib/notifications/notify";
import { selectRuleReviews, reviewBody, reviewTitle, type RuleReviewRow } from "./rule-review";

type AdminClient = { from: (table: string) => any };

export type RuleReviewSweep = {
  /** Rules that needed raising. */
  raised: number;
  /** Notification rows written across all administrators. */
  delivered: number;
};

export async function sweepRuleReviews(admin: AdminClient): Promise<RuleReviewSweep> {
  const { data, error } = await (admin.from("country_commodity_rules") as any)
    .select(
      "id, citation, review_due_at, superseded_at, review_notified_at, source_changed_at, " +
      "origin_country, origin_region, commodities(common_name)"
    )
    .is("superseded_at", null);

  if (error) throw new Error(`Rule review sweep could not read the reference layer: ${error.message}`);

  const rows: RuleReviewRow[] = ((data ?? []) as Array<{
    id: string;
    citation: string;
    review_due_at: string;
    superseded_at: string | null;
    review_notified_at: string | null;
    source_changed_at: string | null;
    origin_country: string | null;
    origin_region: string | null;
    commodities: { common_name: string } | null;
  }>).map((r) => ({
    id: r.id,
    citation: r.citation,
    commodity_name: r.commodities?.common_name ?? null,
    // A rule names a country, names a region, or covers everywhere — see
    // origin_scope on country_commodity_rules. Read narrowest first, and give
    // the global case a name rather than a blank: a review notice saying an
    // overdue rule applies to nothing in particular is worse than no notice.
    origin: r.origin_country ?? r.origin_region ?? "every origin",
    review_due_at: r.review_due_at,
    superseded_at: r.superseded_at,
    review_notified_at: r.review_notified_at,
    source_changed_at: r.source_changed_at,
  }));

  const tasks = selectRuleReviews(rows);
  if (tasks.length === 0) return { raised: 0, delivered: 0 };

  let delivered = 0;

  for (const task of tasks) {
    const sent = await notifyPlatformAdmins(admin as never, {
      type: "rule_review_due",
      title: reviewTitle(task),
      body: reviewBody(task),
      targetUrl: "/admin/reference-rules",
      severity: task.urgency === "due_soon" ? "warning" : "critical",
    });
    delivered += sent;

    // Stamped whether or not anyone received it. If there are no active
    // administrators the rule is not the thing that needs fixing, and
    // re-raising it every morning would bury the day it finally matters.
    await (admin.from("country_commodity_rules") as any)
      .update({ review_notified_at: new Date().toISOString() })
      .eq("id", task.ruleId);
  }

  return { raised: tasks.length, delivered };
}
