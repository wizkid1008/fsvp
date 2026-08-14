import { describe, expect, it } from "vitest";
import { selectRuleReviews, reviewBody, reviewTitle, type RuleReviewRow } from "./rule-review";

const TODAY = "2026-08-14";

function rule(over: Partial<RuleReviewRow> = {}): RuleReviewRow {
  return {
    id: "rule-1",
    citation: "7 CFR 319.56-12",
    commodity_name: "Mango, fresh",
    origin: "Peru",
    review_due_at: "2026-12-01",
    superseded_at: null,
    review_notified_at: null,
    source_changed_at: null,
    ...over,
  };
}

describe("selectRuleReviews", () => {
  it("ignores a rule whose review is comfortably ahead", () => {
    expect(selectRuleReviews([rule({ review_due_at: "2026-12-01" })], TODAY)).toEqual([]);
  });

  it("raises a rule inside the lead time", () => {
    const tasks = selectRuleReviews([rule({ review_due_at: "2026-08-20" })], TODAY);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].urgency).toBe("due_soon");
  });

  it("raises an overdue rule as overdue, not merely due", () => {
    // The distinction matters: an overdue rule is still being resolved against
    // and presented as authoritative when nobody has verified it.
    const tasks = selectRuleReviews([rule({ review_due_at: "2026-07-01" })], TODAY);
    expect(tasks[0].urgency).toBe("overdue");
  });

  it("ignores superseded rules entirely", () => {
    // History. Nothing resolves against them, so re-checking is wasted effort.
    const superseded = rule({ review_due_at: "2020-01-01", superseded_at: "2026-01-01" });
    expect(selectRuleReviews([superseded], TODAY)).toEqual([]);
  });

  it("raises a moved source regardless of the review date", () => {
    // source_changed_at exists precisely because the schedule can be overtaken
    // by events. A rule due in 2027 whose source page changed today needs
    // looking at today.
    const moved = rule({ review_due_at: "2027-12-01", source_changed_at: "2026-08-13" });
    const tasks = selectRuleReviews([moved], TODAY);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].urgency).toBe("source_moved");
  });

  it("does not re-raise something flagged recently", () => {
    // Re-raising daily is how a channel gets muted, which costs more than the
    // notification it was trying to deliver.
    const recent = rule({ review_due_at: "2026-07-01", review_notified_at: "2026-08-01" });
    expect(selectRuleReviews([recent], TODAY)).toEqual([]);
  });

  it("re-raises once the renotify window has passed", () => {
    const stale = rule({ review_due_at: "2026-07-01", review_notified_at: "2026-06-01" });
    expect(selectRuleReviews([stale], TODAY)).toHaveLength(1);
  });

  it("orders moved sources first, then overdue, then due soon", () => {
    const tasks = selectRuleReviews(
      [
        rule({ id: "soon", review_due_at: "2026-08-20" }),
        rule({ id: "overdue", review_due_at: "2026-06-01" }),
        rule({ id: "moved", review_due_at: "2028-01-01", source_changed_at: "2026-08-13" }),
      ],
      TODAY
    );

    expect(tasks.map((t) => t.ruleId)).toEqual(["moved", "overdue", "soon"]);
  });

  it("names an unclassified commodity rather than rendering undefined", () => {
    const tasks = selectRuleReviews(
      [rule({ review_due_at: "2026-08-15", commodity_name: null, origin: null })],
      TODAY
    );
    expect(tasks[0].what).toBe("Unclassified commodity");
  });
});

describe("wording", () => {
  it("says why an overdue rule matters, not just that it is late", () => {
    const [task] = selectRuleReviews([rule({ review_due_at: "2026-06-01" })], TODAY);
    expect(reviewTitle(task)).toContain("overdue");
    expect(reviewBody(task)).toContain("confident wrong answer");
  });

  it("explains that a moved source overtakes the schedule", () => {
    const [task] = selectRuleReviews([rule({ source_changed_at: "2026-08-13" })], TODAY);
    expect(reviewTitle(task)).toContain("Source moved");
    expect(reviewBody(task)).toContain("ACIR");
  });
});
