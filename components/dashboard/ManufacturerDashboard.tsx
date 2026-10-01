import { ExporterDashboard } from "./ExporterDashboard";

type SupabaseLike = { from: (table: string) => any };

/**
 * A supplier further up the chain — a manufacturer or processor an exporter
 * buys from. It owes the same kinds of documents in the same way, so it gets
 * the same dashboard, counting the exporters buying from it instead of its own
 * upstream vendors.
 *
 * This used to be a separate dashboard with its own checklist, whose "Upload
 * facility evidence" step looked only at the five most recent documents — so
 * it could read "not done" with accepted evidence on file.
 */
export function ManufacturerDashboard(props: {
  supplierId: string | null;
  companyName: string | null;
  displayName: string;
  supabase: SupabaseLike;
}) {
  return <ExporterDashboard {...props} variant="manufacturer" />;
}
