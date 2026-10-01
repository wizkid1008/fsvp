import { redirect } from "next/navigation";

export const runtime = "edge";

/**
 * Retired: this was the FSVP Pipeline, a page of every blocker grouped by
 * stage. Each blocker is now shown with the product it holds up — under its
 * row on the Products list, and at the top of its own page — and the stages are
 * a reference list at the foot of Products. See components/products/ProductReasons.tsx.
 *
 * Kept as a redirect for bookmarks and older `/setup/fsvp#gate-<id>` links; the
 * browser carries the fragment across, and Products renders the same anchors.
 */
export default function RetiredPipelinePage() {
  redirect("/products");
}
