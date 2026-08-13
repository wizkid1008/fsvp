/**
 * Turns compliance alerts into things a person will actually see.
 *
 * The pieces for this already existed and were never connected.
 * `generate_compliance_alerts()` (migration 003) is a dated, idempotent daily
 * sweep that finds reassessments falling due, documents about to expire and
 * corrective actions left open, and writes a `compliance_alerts` row for each.
 * `notify()` fans a message out to every profile in a tenant and the header bell
 * reads it.
 *
 * Nothing joined them. `compliance_alerts` had zero application references, so
 * the sweep wrote rows into a table no screen read and no person was told. The
 * platform knew a certificate was lapsing and kept it to itself — which for a
 * product whose value is expiry dates is close to the whole point being missed.
 *
 * This is deliberately the delivery half only. Detection stays in SQL where it
 * is already correct, and email, when there is a provider, becomes a second
 * adapter reading the same alerts rather than a second sweep.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { notify, type NotificationSeverity } from "./notify";

type AdminClient = SupabaseClient<Database>;

export type AlertRow = {
  id: string;
  importer_id: string;
  alert_type: string;
  title: string;
  description: string | null;
  due_date: string;
  severity: string;
  fsvp_record_id: string | null;
  document_id: string | null;
};

/** compliance_alerts uses four levels; notifications use three. */
export function alertSeverity(severity: string): NotificationSeverity {
  if (severity === "critical" || severity === "high") return "critical";
  if (severity === "medium") return "warning";
  return "info";
}

/**
 * Where the alert wants you to go. An alert that drops you on a list to search
 * for the thing it is about has wasted the trip, so record-level alerts deep
 * link and only the genuinely list-shaped ones do not.
 */
export function alertTarget(alert: AlertRow): string {
  if (alert.fsvp_record_id) return `/fsvp-records/${alert.fsvp_record_id}`;
  switch (alert.alert_type) {
    case "document_expiring":          return "/evidence";
    case "corrective_action_open":     return "/gaps-actions";
    case "supplier_approval_due":      return "/exporters";
    case "reassessment_due":           return "/fsvp-records";
    case "facility_registration_due":  return "/facilities";
    default:                           return "/dashboard";
  }
}

/** Days until due, negative when already past. */
export function daysUntil(dueDate: string, today: Date = new Date()): number {
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((due - now) / 86_400_000);
}

/**
 * The line under the title. `description` from the sweep says what the thing is;
 * this says how urgent it is, which is the part that decides whether someone
 * acts today.
 */
export function alertBody(alert: AlertRow, today: Date = new Date()): string {
  const days = daysUntil(alert.due_date, today);
  const when =
    days < 0  ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}.`
    : days === 0 ? "Due today."
    : days === 1 ? "Due tomorrow."
    : `Due in ${days} days.`;

  return alert.description ? `${alert.description} ${when}` : when;
}

export type DeliveryResult = { delivered: number; skipped: number };

/**
 * Sends a notification for every open alert not yet delivered.
 *
 * Dedupe is by `notified_at` on the alert itself rather than by inspecting
 * app_notifications, so a tenant that has twelve people does not get twelve
 * chances to re-send. The sweep is idempotent on alert CREATION; this makes
 * delivery idempotent too, which matters because the cron may run more than
 * once a day and a duplicate "your certificate expires" is how people learn to
 * ignore the bell.
 */
export async function deliverPendingAlerts(
  admin: AdminClient,
  today: Date = new Date()
): Promise<DeliveryResult> {
  const { data, error } = await (admin.from("compliance_alerts") as any)
    .select("id, importer_id, alert_type, title, description, due_date, severity, fsvp_record_id, document_id")
    .eq("status", "open")
    .is("notified_at", null)
    .order("due_date", { ascending: true })
    .limit(500);

  if (error) throw new Error(`Reading compliance alerts failed: ${error.message}`);

  const alerts = (data ?? []) as AlertRow[];
  if (alerts.length === 0) return { delivered: 0, skipped: 0 };

  let delivered = 0;

  for (const alert of alerts) {
    await notify(admin, {
      importerId: alert.importer_id,
      type:       alert.alert_type,
      title:      alert.title,
      body:       alertBody(alert, today),
      targetUrl:  alertTarget(alert),
      severity:   alertSeverity(alert.severity),
    });
    delivered += 1;
  }

  // Stamped after sending. notify() swallows its own failures by design, so the
  // worst case here is an alert marked delivered that produced no row — which
  // loses one notification. Stamping first would risk the same thing on any
  // error, and re-sending every alert on every cron run is the louder failure.
  const { error: stampError } = await (admin.from("compliance_alerts") as any)
    .update({ notified_at: new Date().toISOString() })
    .in("id", alerts.map((a) => a.id));

  if (stampError) {
    throw new Error(
      `Alerts were delivered but could not be marked as sent, so the next run would repeat them: ${stampError.message}`
    );
  }

  return { delivered, skipped: 0 };
}
