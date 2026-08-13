import { redirect } from "next/navigation";

export const runtime = "edge";

// Renamed to /entry-readiness. The screen evaluates a PRODUCT — classification,
// origin, admissibility, applicability — not a shipment, and there is no
// shipment entity in the schema at all. Holding the name meant Phase 3's real
// shipment gate would have had to be called something else. Kept as a redirect
// because the old path is in bookmarks and in notification target_urls.
export default function ShipmentReadinessPage() {
  redirect("/entry-readiness");
}
