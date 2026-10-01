import { redirect } from "next/navigation";

export const runtime = "edge";

/**
 * Retired: Exporter Submissions is now a tab of the Document Library
 * (components/evidence/ExporterSubmissions.tsx). Kept as a redirect because
 * notifications already sent link here (app/api/forms/responses).
 */
export default function RetiredImporterReviewPage() {
  redirect("/evidence?tab=submissions");
}
