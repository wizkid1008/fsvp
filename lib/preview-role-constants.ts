// Cookie name constants only — safe to import from client components.
// Anything that touches next/headers (cookies()) belongs in lib/preview-role.ts,
// which is server-only and must never be imported from a "use client" file.

export const PREVIEW_ROLE_COOKIE = "fsvp_preview_role";
export const PREVIEW_SUPPLIER_ID_COOKIE = "fsvp_preview_supplier_id";
export const PREVIEW_SUPPLIER_NAME_COOKIE = "fsvp_preview_supplier_name";
