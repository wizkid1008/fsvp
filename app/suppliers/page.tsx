import { redirect } from "next/navigation";

export const runtime = "edge";

// The importer's exporter list moved to /exporters so the route matches what
// every label in the app calls it. Kept as a redirect because this URL is in
// bookmarks, invite emails and older FSVP records.
export default function SuppliersPage() {
  redirect("/exporters");
}
