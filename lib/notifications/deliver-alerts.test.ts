import { describe, expect, it } from "vitest";
import { alertBody, alertSeverity, alertTarget, daysUntil, type AlertRow } from "./deliver-alerts";

const TODAY = new Date("2026-08-13T09:00:00Z");

function alert(over: Partial<AlertRow> = {}): AlertRow {
  return {
    id: "alert-1",
    importer_id: "imp-1",
    alert_type: "reassessment_due",
    title: "Reassessment due — Mango Puree",
    description: "Pacific Valley Foods.",
    due_date: "2026-08-20",
    severity: "medium",
    fsvp_record_id: null,
    document_id: null,
    ...over,
  };
}

describe("alertSeverity", () => {
  it("collapses four alert levels onto three notification levels", () => {
    // compliance_alerts allows low/medium/high/critical; notifications take
    // info/warning/critical. high must not quietly become a warning.
    expect(alertSeverity("critical")).toBe("critical");
    expect(alertSeverity("high")).toBe("critical");
    expect(alertSeverity("medium")).toBe("warning");
    expect(alertSeverity("low")).toBe("info");
  });

  it("treats an unknown level as the quietest, not the loudest", () => {
    expect(alertSeverity("bogus")).toBe("info");
  });
});

describe("daysUntil", () => {
  it("counts forward, today, and overdue", () => {
    expect(daysUntil("2026-08-20", TODAY)).toBe(7);
    expect(daysUntil("2026-08-13", TODAY)).toBe(0);
    expect(daysUntil("2026-08-06", TODAY)).toBe(-7);
  });

  it("ignores the time of day", () => {
    // The sweep stores a date; the caller passes a timestamp. An alert must not
    // read as "due tomorrow" at 09:00 and "due today" at 23:00.
    const morning = new Date("2026-08-13T00:30:00Z");
    const night   = new Date("2026-08-13T23:30:00Z");
    expect(daysUntil("2026-08-14", morning)).toBe(daysUntil("2026-08-14", night));
  });
});

describe("alertBody", () => {
  it("says how urgent it is, not just what it is", () => {
    expect(alertBody(alert(), TODAY)).toBe("Pacific Valley Foods. Due in 7 days.");
  });

  it("singularises one day, and names today and tomorrow", () => {
    expect(alertBody(alert({ due_date: "2026-08-13" }), TODAY)).toMatch(/Due today\.$/);
    expect(alertBody(alert({ due_date: "2026-08-14" }), TODAY)).toMatch(/Due tomorrow\.$/);
    expect(alertBody(alert({ due_date: "2026-08-12" }), TODAY)).toMatch(/Overdue by 1 day\.$/);
    expect(alertBody(alert({ due_date: "2026-08-11" }), TODAY)).toMatch(/Overdue by 2 days\.$/);
  });

  it("stands alone when the sweep supplied no description", () => {
    expect(alertBody(alert({ description: null, due_date: "2026-08-13" }), TODAY)).toBe("Due today.");
  });
});

describe("alertTarget", () => {
  it("deep links to the record whenever the alert names one", () => {
    // An alert that drops you on a list to search for the thing it is about has
    // wasted the trip.
    expect(alertTarget(alert({ fsvp_record_id: "rec-9" }))).toBe("/fsvp-records/rec-9");
    expect(alertTarget(alert({ alert_type: "document_expiring", fsvp_record_id: "rec-9" })))
      .toBe("/fsvp-records/rec-9");
  });

  it("falls back to the screen that owns each alert type", () => {
    expect(alertTarget(alert({ alert_type: "document_expiring" }))).toBe("/evidence");
    expect(alertTarget(alert({ alert_type: "corrective_action_open" }))).toBe("/gaps-actions");
    expect(alertTarget(alert({ alert_type: "supplier_approval_due" }))).toBe("/exporters");
    expect(alertTarget(alert({ alert_type: "reassessment_due" }))).toBe("/fsvp-records");
  });

  it("sends an FDA registration renewal to the facilities list", () => {
    // Added with migration 017. Without a case here it would fall through to
    // /dashboard, which is a dead end for a facility-level task.
    expect(alertTarget(alert({ alert_type: "facility_registration_due" }))).toBe("/facilities");
  });

  it("never sends an unrecognised type to a dead end", () => {
    // entry_filing_pending is allowed by the CHECK constraint but Phase 3 does
    // not exist yet, so nothing generates it. It must still land somewhere real.
    expect(alertTarget(alert({ alert_type: "entry_filing_pending" }))).toBe("/dashboard");
  });

  it("points at /exporters, not the retired /suppliers route", () => {
    expect(alertTarget(alert({ alert_type: "supplier_approval_due" }))).not.toContain("/suppliers");
  });
});
