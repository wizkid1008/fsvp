/**
 * Who is confined to a single importer tenant, and who is not.
 *
 * Before 004_reviewer_tenancy.sql the answer was simply "us_importer is
 * confined, everyone else is not", and a good many API guards were written as
 * `if (profile.role === "us_importer" && row.importer_id !== profile.importer_id)`.
 * That is no longer safe: a reviewer now means one of two different things
 * depending on whether they carry an importer_id.
 *
 *   administrator                   → platform-wide
 *   reviewer with no importer_id    → platform-wide compliance reviewer
 *   reviewer with an importer_id    → one tenant's FSVP qualified individual
 *   us_importer                     → one tenant
 *
 * The rule this encodes: anyone holding an importer_id is confined to it.
 * Use `isTenantConfined` in every guard that compares a row's importer_id to
 * the caller's, so the distinction is made in one place rather than re-derived
 * per route.
 */

export type TenancyProfile = {
  role: string;
  importer_id: string | null;
};

/** True when the caller may act across tenants. */
export function isCrossTenant(profile: TenancyProfile): boolean {
  if (profile.role === "administrator") return true;
  if (profile.role === "reviewer" && !profile.importer_id) return true;
  return false;
}

/** True when the caller may only act inside their own importer_id. */
export function isTenantConfined(profile: TenancyProfile): boolean {
  return !isCrossTenant(profile);
}

/**
 * The standard guard: returns true when this caller must NOT touch this row.
 *
 *   if (deniesTenant(profile, row.importer_id)) return 403;
 *
 * NOT a drop-in replacement for the hand-rolled check that twelve API routes
 * still use:
 *
 *   row.importer_id !== profile.importer_id && profile.role !== "administrator"
 *
 * That form denies a PLATFORM reviewer; this one admits it. Where a route is
 * already gated to ["us_importer", "administrator"] the two agree and swapping
 * is safe. Where a route also admits "reviewer" — fsvp/hazard-analyses and
 * fsvp/verification-records — swapping would grant a platform-wide reviewer
 * cross-tenant WRITE access, and because those routes use the admin client the
 * route check is the only thing in the way. 004_reviewer_tenancy.sql moved
 * write policies to current_importer_ids_write() precisely to exclude
 * reviewers; do not undo that from the application side.
 *
 * ./tenancy.test.ts pins this difference.
 */
export function deniesTenant(profile: TenancyProfile, rowImporterId: string | null): boolean {
  if (isCrossTenant(profile)) return false;
  return !profile.importer_id || rowImporterId !== profile.importer_id;
}
