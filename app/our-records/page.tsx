import { redirect } from "next/navigation";

export const runtime = "edge";

/**
 * Retired: Our FSVP Records is now the Company records tab of the Document
 * Library (components/evidence/CompanyRecords.tsx). Kept as a redirect for
 * bookmarks and older links.
 */
export default function RetiredOurRecordsPage() {
  redirect("/evidence?tab=company");
}
