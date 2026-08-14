import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotifyInput {
  /** Tenant the notification belongs to. Null for supplier-only notices. */
  importerId?: string | null;
  /** Supplier the notification concerns — lets the exporter's users see it. */
  supplierId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  targetUrl?: string | null;
  severity?: NotificationSeverity;
}

/**
 * Writes an app_notifications row for every profile that should see it.
 *
 * Until now `app_notifications` was read by the notifications page and the admin
 * dashboard but written by essentially nothing, so the Notifications nav item
 * was permanently an empty page. Every event that should pull an importer or
 * exporter back into the workflow — evidence decided, record approved,
 * corrective action opened — goes through here.
 *
 * Failures are swallowed deliberately: a notification is never worth failing the
 * action that triggered it.
 */
/**
 * Notify every active platform administrator.
 *
 * Some work belongs to nobody's tenant. A country-commodity rule is platform
 * reference data, and re-checking it against APHIS is an administrator's job —
 * so it cannot go through notify(), which resolves recipients from an
 * importer_id or supplier_id, and cannot be a compliance_alerts row, since that
 * table requires an importer_id. Attributing it to an arbitrary tenant would
 * put platform work in a customer's queue.
 *
 * Same swallow-on-failure rule as notify(): a notification is never worth
 * failing the sweep that produced it.
 */
export async function notifyPlatformAdmins(
  admin: AdminClient,
  input: Omit<NotifyInput, "importerId" | "supplierId">
): Promise<number> {
  try {
    const { data } = await (admin.from("profiles") as any)
      .select("id")
      .eq("role", "administrator")
      .eq("user_status", "active");

    const recipients = (data ?? []) as Array<{ id: string }>;
    if (recipients.length === 0) return 0;

    const { error } = await (admin.from("app_notifications") as any).insert(
      recipients.map((p) => ({
        importer_id:          null,
        supplier_id:          null,
        recipient_profile_id: p.id,
        notification_type:    input.type,
        title:                input.title,
        body:                 input.body ?? null,
        target_url:           input.targetUrl ?? null,
        severity:             input.severity ?? "info",
      }))
    );

    return error ? 0 : recipients.length;
  } catch {
    return 0;
  }
}

export async function notify(admin: AdminClient, input: NotifyInput): Promise<void> {
  try {
    const recipients = new Set<string>();

    if (input.importerId) {
      const { data } = await (admin.from("profiles") as any)
        .select("id")
        .eq("importer_id", input.importerId)
        .eq("user_status", "active");
      for (const p of (data ?? []) as Array<{ id: string }>) recipients.add(p.id);
    }

    if (input.supplierId) {
      const { data } = await (admin.from("profiles") as any)
        .select("id")
        .eq("supplier_id", input.supplierId);
      for (const p of (data ?? []) as Array<{ id: string }>) recipients.add(p.id);
    }

    // An importer-managed exporter has no user accounts of its own. Recording
    // the row against the tenant with no recipient still keeps it visible to
    // the importer's own users, so nothing is lost.
    const rows = recipients.size > 0
      ? [...recipients].map((profileId) => ({
          importer_id:          input.importerId ?? null,
          supplier_id:          input.supplierId ?? null,
          recipient_profile_id: profileId,
          notification_type:    input.type,
          title:                input.title,
          body:                 input.body ?? null,
          target_url:           input.targetUrl ?? null,
          severity:             input.severity ?? "info",
        }))
      : [{
          importer_id:          input.importerId ?? null,
          supplier_id:          input.supplierId ?? null,
          recipient_profile_id: null,
          notification_type:    input.type,
          title:                input.title,
          body:                 input.body ?? null,
          target_url:           input.targetUrl ?? null,
          severity:             input.severity ?? "info",
        }];

    await (admin.from("app_notifications") as any).insert(rows);
  } catch {
    // Non-fatal by design.
  }
}
