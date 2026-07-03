import { cookies } from "next/headers";
import type { AppRole } from "@/types/platform";

export const PREVIEW_ROLE_COOKIE = "fsvp_preview_role";

const VALID_ROLES: AppRole[] = ["supplier", "exporter", "us_importer", "reviewer", "administrator"];

export function getPreviewRole(): AppRole | null {
  const value = cookies().get(PREVIEW_ROLE_COOKIE)?.value;
  return value && (VALID_ROLES as string[]).includes(value) ? (value as AppRole) : null;
}

// Only administrators can preview as another role — a non-admin can never
// escalate by forging this cookie, since their real role always wins.
export function resolveEffectiveRole(realRole: AppRole, previewRole: AppRole | null): AppRole {
  if (realRole !== "administrator") return realRole;
  return previewRole ?? realRole;
}
