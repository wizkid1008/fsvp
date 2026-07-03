import { cookies } from "next/headers";
import type { AppRole } from "@/types/platform";

export const PREVIEW_ROLE_COOKIE = "fsvp_preview_role";
export const PREVIEW_SUPPLIER_ID_COOKIE = "fsvp_preview_supplier_id";
export const PREVIEW_SUPPLIER_NAME_COOKIE = "fsvp_preview_supplier_name";

const VALID_ROLES: AppRole[] = ["supplier", "exporter", "us_importer", "reviewer", "administrator"];

export function getPreviewRole(): AppRole | null {
  const value = cookies().get(PREVIEW_ROLE_COOKIE)?.value;
  return value && (VALID_ROLES as string[]).includes(value) ? (value as AppRole) : null;
}

// A specific supplier/exporter account the admin picked to preview as,
// e.g. "view the dashboard exactly as Acme Foods sees it" rather than
// just "view a generic supplier dashboard shape".
export function getPreviewSupplierId(): string | null {
  return cookies().get(PREVIEW_SUPPLIER_ID_COOKIE)?.value ?? null;
}

// Only administrators can preview as another role — a non-admin can never
// escalate by forging this cookie, since their real role always wins.
export function resolveEffectiveRole(realRole: AppRole, previewRole: AppRole | null): AppRole {
  if (realRole !== "administrator") return realRole;
  return previewRole ?? realRole;
}
