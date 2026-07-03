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

// A specific account the admin picked to preview as — a suppliers.id row
// for the supplier/exporter roles, or an importers.id row for us_importer —
// e.g. "view the dashboard exactly as Acme Foods sees it" rather than just
// "view a generic supplier dashboard shape".
export function getPreviewSupplierId(): string | null {
  return cookies().get(PREVIEW_SUPPLIER_ID_COOKIE)?.value ?? null;
}

// Which account id a page should scope its data to. Real users always see
// their own account. A real administrator previewing a role sees whichever
// account they picked (or no account at all, for the generic empty-state
// preview) — never their own, since admins aren't linked to one.
export function resolvePreviewedAccountId(realRole: AppRole, ownAccountId: string | null): string | null {
  if (realRole === "administrator") return getPreviewSupplierId();
  return ownAccountId;
}

// Only administrators can preview as another role — a non-admin can never
// escalate by forging this cookie, since their real role always wins.
export function resolveEffectiveRole(realRole: AppRole, previewRole: AppRole | null): AppRole {
  if (realRole !== "administrator") return realRole;
  return previewRole ?? realRole;
}
