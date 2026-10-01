import { redirect } from "next/navigation";

export const runtime = "edge";

/**
 * Retired: it showed the company-documents count and the company requirement
 * list, both now on Company Overview (/corporate#documents) — which had its
 * own, different copy of each. Facility and product requirements are on their
 * own pages, as on the importer side. Kept as a redirect for bookmarks.
 */
export default function RetiredMyReadinessPage() {
  redirect("/corporate#documents");
}
