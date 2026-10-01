import { redirect } from "next/navigation";

export const runtime = "edge";

/**
 * Retired: an exporter's readiness assessment is on that exporter's page now
 * (components/readiness/ExporterAssessment.tsx), and the requirement lists this
 * page repeated are on the exporter, facility and product pages. Kept as a
 * redirect for bookmarks; ?supplier= lands on that exporter's assessment.
 */
export default function RetiredReadinessPage({ searchParams }: { searchParams: { supplier?: string } }) {
  const supplier = searchParams?.supplier;
  redirect(supplier && /^[0-9a-f-]{36}$/i.test(supplier) ? `/exporters/${supplier}#assessment` : "/exporters");
}
