export const APP_NAME = "ThrushCross Verify";
export const PARENT_BRAND = "ThrushCross Trading & Commodities";
export const APP_SUBTITLE = "FSVP Compliance & Supplier Verification Platform";
export const BRAND_TAGLINE = "Verify • Trade • Grow";

export const LEGAL_DISCLAIMER =
  "This platform does not provide legal or regulatory advice. FSVP determinations should be reviewed by qualified regulatory professionals and/or a qualified FSVP Individual.";

export const DOCUMENT_BUCKET = "supplier-documents";
export const BACKGROUND_DOCUMENT_BUCKET = "background-documents";

export const protectedRoutes = [
  "/dashboard",
  "/account",
  "/profile",
  "/suppliers",
  "/supplier",
  "/products-facilities",
  "/products",
  "/commodities",
  "/facilities",
  "/evidence",
  "/documents",
  "/requirements",
  "/readiness",
  "/assessment",
  "/corrective-actions",
  "/reviewer",
  "/admin",
  "/reports",
  "/notifications",
  "/audit-log",
  "/settings"
];

export const roleProtectedRoutes: Record<string, string[]> = {
  "/admin": ["administrator"],
  "/audit-log": ["reviewer", "administrator"],
  "/reviewer": ["reviewer", "administrator"]
};
