/**
 * Which country-commodity rules need re-checking against the agency.
 *
 * docs/reference-layer-curation.md, § 3.4: "Review scheduling and alerting —
 * already in the schema: review_due_at, rule_is_current(), the
 * country_commodity_rules_status view. What is missing is a screen and a
 * notification. Without those, the review dating is a mechanism nobody can act
 * on, and the whole design rests on someone actually re-checking."
 *
 * The design's core claim is that a stale rule is worse than no rule, because
 * an importer told "permitted, no permit required" by a row nobody has checked
 * since 2024 stops looking. review_due_at is what makes that claim keepable —
 * but only if the date reaches a person.
 *
 * This is deliberately NOT a compliance_alerts row. That table requires an
 * importer_id, and a rule belongs to no tenant: it is platform reference data,
 * and re-checking it is an administrator's job. Attributing it to some
 * arbitrary importer would put another tenant's task in their queue.
 */

export type RuleReviewRow = {
  id: string;
  citation: string;
  commodity_name: string | null;
  origin: string | null;
  review_due_at: string;
  superseded_at: string | null;
  review_notified_at: string | null;
  source_changed_at: string | null;
};

export type ReviewUrgency = "overdue" | "due_soon" | "source_moved";

export type RuleReviewTask = {
  ruleId: string;
  urgency: ReviewUrgency;
  citation: string;
  what: string;
  dueOn: string;
};

/** How far ahead a review is worth raising. A rule re-check means reading ACIR
 *  and the CFR, so a fortnight is the shortest useful warning. */
export const REVIEW_LEAD_DAYS = 14;

/** Re-raise a still-unactioned review monthly rather than once, forever. */
export const RENOTIFY_AFTER_DAYS = 30;

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

function describe(rule: RuleReviewRow): string {
  const commodity = rule.commodity_name ?? "Unclassified commodity";
  return rule.origin ? `${commodity} from ${rule.origin}` : commodity;
}

/**
 * The rules an administrator should look at today.
 *
 * Superseded rules are skipped: they are history, and nothing resolves against
 * them. A rule whose source page has moved is raised regardless of its review
 * date — the whole point of source_changed_at is that the schedule has been
 * overtaken by events.
 */
export function selectRuleReviews(
  rules: RuleReviewRow[],
  today: string = new Date().toISOString().slice(0, 10)
): RuleReviewTask[] {
  const tasks: RuleReviewTask[] = [];

  for (const rule of rules) {
    if (rule.superseded_at) continue;

    const daysUntilDue = daysBetween(today, rule.review_due_at);
    const sourceMoved = Boolean(rule.source_changed_at);

    if (!sourceMoved && daysUntilDue > REVIEW_LEAD_DAYS) continue;

    // Already told them recently, and nothing has changed since. Re-raising
    // daily is how a notification channel gets muted, which costs more than
    // the one it was trying to deliver.
    if (rule.review_notified_at) {
      const sinceNotice = daysBetween(rule.review_notified_at, today);
      if (sinceNotice < RENOTIFY_AFTER_DAYS) continue;
    }

    tasks.push({
      ruleId: rule.id,
      urgency: sourceMoved ? "source_moved" : daysUntilDue < 0 ? "overdue" : "due_soon",
      citation: rule.citation,
      what: describe(rule),
      dueOn: rule.review_due_at.slice(0, 10),
    });
  }

  // Most urgent first: a moved source has already invalidated the schedule, an
  // overdue rule is being presented as authoritative when it should not be.
  const rank: Record<ReviewUrgency, number> = { source_moved: 0, overdue: 1, due_soon: 2 };
  return tasks.sort((a, b) => rank[a.urgency] - rank[b.urgency] || a.dueOn.localeCompare(b.dueOn));
}

export function reviewTitle(task: RuleReviewTask): string {
  switch (task.urgency) {
    case "source_moved":
      return `Source moved — re-check ${task.what}`;
    case "overdue":
      return `Rule review overdue — ${task.what}`;
    case "due_soon":
      return `Rule review due — ${task.what}`;
  }
}

export function reviewBody(task: RuleReviewTask): string {
  const base = `${task.citation}, review due ${task.dueOn}.`;
  switch (task.urgency) {
    case "source_moved":
      return `${base} The page this rule was read from has changed since it was verified, so the ` +
             `schedule has been overtaken. Re-check APHIS ACIR before this rule is relied on again.`;
    case "overdue":
      return `${base} Until it is re-checked it must not be presented as authoritative — a rule ` +
             `nobody has verified produces a confident wrong answer.`;
    case "due_soon":
      return `${base} Re-check it against APHIS ACIR and record the new review date.`;
  }
}
