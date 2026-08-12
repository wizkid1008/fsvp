export const APP_NAME = "ThrushCross Verify";
export const PARENT_BRAND = "ThrushCross Trading & Commodities";
export const APP_SUBTITLE = "FSVP Compliance & Supplier Verification Platform";
export const BRAND_TAGLINE = "Verify • Trade • Grow";

export const SUPPORT_EMAIL = "support@thrushcrosstrading.com";

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
  "/my-suppliers",
  "/suppliers",
  "/products",
  "/facilities",
  "/evidence",
  "/setup",
  "/applicability",
  "/fsvp-records",
  "/compliance-history",
  "/qualified-individuals",
  "/gaps-actions",
  "/readiness",
  "/shipment-readiness",
  "/reviewer",
  "/importer-review",
  "/admin",
  "/reports",
  "/audit-log",
  "/notifications",
  "/settings",
];

export const roleProtectedRoutes: Record<string, string[]> = {
  "/admin":        ["administrator"],
  "/audit-log":    ["reviewer", "administrator"],
  "/reviewer":     ["reviewer", "administrator"],
  "/corporate":    ["supplier", "exporter"],
  "/my-suppliers": ["exporter"],
  "/suppliers":    ["us_importer", "administrator"],
  "/products":     ["supplier", "exporter", "us_importer", "administrator"],
  "/facilities":   ["supplier", "exporter", "us_importer", "administrator"],
  "/evidence":     ["us_importer", "administrator"],
  "/setup":        ["us_importer", "administrator"],
  "/applicability": ["us_importer", "reviewer", "administrator"],
  "/fsvp-records/new": ["us_importer", "administrator"],
  "/fsvp-records": ["us_importer", "reviewer", "administrator"],
  "/compliance-history": ["us_importer", "reviewer", "administrator"],
  "/qualified-individuals": ["us_importer", "reviewer", "administrator"],
  "/importer-review": ["us_importer", "administrator"],
  "/gaps-actions": ["us_importer", "administrator"],
  "/readiness":    ["us_importer", "administrator"],
  "/shipment-readiness": ["us_importer", "administrator"],
  "/reports":      ["us_importer", "administrator"],
  "/my-evidence":  ["supplier", "exporter"],
  "/my-readiness": ["supplier", "exporter"],
  "/notifications": ["us_importer", "administrator"],
};
