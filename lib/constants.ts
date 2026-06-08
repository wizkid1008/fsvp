export const APP_NAME = "ThrushCross Verify";
export const PARENT_BRAND = "ThrushCross Trading & Commodities";
export const APP_SUBTITLE = "FSVP Compliance & Supplier Verification Platform";
export const BRAND_TAGLINE = "Verify • Trade • Grow";

export const LEGAL_DISCLAIMER =
  "This platform does not provide legal or regulatory advice. FSVP determinations should be reviewed by qualified regulatory professionals and/or a qualified FSVP Individual.";

export const DOCUMENT_BUCKET = "supplier-documents";
export const BACKGROUND_DOCUMENT_BUCKET = "background-documents";
export const DOCUMENT_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
export const DOCUMENT_UPLOAD_MAX_LABEL = "3 MB";

export const protectedRoutes = [
  "/dashboard",
  "/account",
  "/corporate",
  "/my-evidence",
  "/my-readiness",
  "/my-requests",
  "/suppliers",
  "/products",
  "/facilities",
  "/evidence",
  "/fsvp-records",
  "/gaps-actions",
  "/readiness",
  "/reviewer",
  "/admin",
  "/reports",
  "/audit-log",
];

export const roleProtectedRoutes: Record<string, string[]> = {
  "/admin": ["administrator"],
  "/audit-log": ["reviewer", "administrator"],
  "/reviewer": ["reviewer", "administrator"],
  "/corporate": ["supplier"],
  "/suppliers": ["us_importer", "reviewer", "administrator"],
  "/products": ["supplier", "us_importer", "reviewer", "administrator"],
  "/facilities": ["supplier", "us_importer", "reviewer", "administrator"],
  "/evidence": ["us_importer", "reviewer", "administrator"],
  "/fsvp-records": ["us_importer", "reviewer", "administrator"],
  "/gaps-actions": ["us_importer", "administrator"],
  "/readiness": ["us_importer", "administrator"],
  "/reports": ["us_importer", "reviewer", "administrator"],
  "/my-evidence": ["supplier"],
  "/my-readiness": ["supplier"],
  "/my-requests": ["supplier"],
};
