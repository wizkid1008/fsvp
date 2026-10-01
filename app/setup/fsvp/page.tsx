import { redirect } from "next/navigation";

export const runtime = "edge";

/**
 * Retired: this was the FSVP Pipeline, a page of every blocker grouped by
 * stage. Each blocker is now shown with the product it holds up — under its
 * own page, one click deep — and the stages are
 * a reference list inside it. See components/products/ProductReasons.tsx.
 *
 * Kept as a redirect for bookmarks and older links.
 */
export default function RetiredPipelinePage() {
  redirect("/products");
}
