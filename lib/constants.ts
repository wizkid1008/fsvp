export const APP_NAME = "FSVP Compliance Platform";

export const LEGAL_DISCLAIMER =
  "This platform does not provide legal or regulatory advice. All FSVP determinations should be reviewed by qualified regulatory professionals and/or a qualified FSVP Individual.";

export const DOCUMENT_BUCKET = "supplier-documents";
export const BACKGROUND_DOCUMENT_BUCKET = "background-documents";

export const protectedRoutes = [
  "/dashboard",
  "/profile",
  "/supplier",
  "/products",
  "/facilities",
  "/documents",
  "/assessment",
  "/reviewer",
  "/admin",
  "/reports",
  "/notifications",
  "/settings"
];

export const roleProtectedRoutes: Record<string, string[]> = {
  "/admin": ["administrator"],
  "/reviewer": ["reviewer", "administrator"]
};
