import { redirect } from "next/navigation";

export const runtime = "edge";

/**
 * Retired: Products shows the same answer now — each product's FSVP status
 * (with "Do not ship" for a prohibited food) and its next step, from the shared
 * planner in lib/setup/fsvp-workflow.ts. This page made its own judgement and
 * could disagree with the product's own page. Kept as a redirect for bookmarks
 * and notification links.
 */
export default function RetiredEntryReadinessPage() {
  redirect("/products");
}
