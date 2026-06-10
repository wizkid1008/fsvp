import Link from "next/link";
import { CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

type SupabaseLike = { from: (table: string) => any };

const EXPORT_ELIGIBLE_TYPES = ["exporter", "exporter_manufacturer", "trader"];

export async function ExportEligibilityBanner({
  supplierId,
  supplierType,
  supabase,
}: {
  supplierId: string | null;
  supplierType: string | null;
  supabase: SupabaseLike;
}) {
  if (!supplierId) return null;

  const isEligible = EXPORT_ELIGIBLE_TYPES.includes(supplierType ?? "");

  // Count active importer links
  const { count: importerLinkCount } = await (supabase.from("importer_supplier_links") as any)
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", supplierId)
    .eq("relationship_status", "active") as { count: number | null };

  // Count exporters this entity supplies to (if it's a manufacturer)
  const { count: exporterLinkCount } = await (supabase.from("exporter_supplier_links") as any)
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", supplierId)
    .eq("status", "active") as { count: number | null };

  if (isEligible) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-800">
            Export eligible
          </p>
          <p className="mt-0.5 text-xs text-emerald-700">
            This entity can export directly to US importers as an{" "}
            <span className="font-medium capitalize">{supplierType?.replace(/_/g, " ")}</span>.
            {(importerLinkCount ?? 0) > 0
              ? ` Linked to ${importerLinkCount} active importer${importerLinkCount === 1 ? "" : "s"}.`
              : " Not yet linked to any importer."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-800">
          Not directly export-eligible
        </p>
        <p className="mt-0.5 text-xs text-amber-700">
          This entity type (<span className="font-medium capitalize">{supplierType?.replace(/_/g, " ") ?? "unknown"}</span>)
          cannot link directly to a US importer. To export, this entity must be
          linked to an exporter or trader who manages the importer relationship.
        </p>
        {(exporterLinkCount ?? 0) > 0 ? (
          <p className="mt-1 text-xs font-medium text-amber-700">
            ✓ Linked to {exporterLinkCount} exporter{exporterLinkCount === 1 ? "" : "s"} who can export on your behalf.
          </p>
        ) : (
          <Link
            href="/my-suppliers"
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 underline-offset-2 hover:underline"
          >
            View exporters you supply to <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}
