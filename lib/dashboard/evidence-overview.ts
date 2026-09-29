// The importer dashboard's "Required evidence" card: required documents at
// each level, summed across this importer's exporters, facilities and products.
//
// Loaded by app/api/dashboard/evidence rather than by the dashboard page. The
// page already spends most of a Cloudflare Worker's subrequest budget on the
// setup plan — several queries per product and per record — and when this ran
// last in the same request its queries failed, which read as "No documents
// required yet" beside a list page showing eleven awaiting review. A request of
// its own gets a budget of its own.

import { fetchEvidenceProgress } from "@/lib/readiness/evidence-progress";
import { sumProgress, type EvidenceProgress } from "@/lib/readiness/evidence-scope";

type SupabaseLike = { from: (table: string) => any };

export type EvidenceOverviewRow = {
  label: string;
  /** How many exporters / facilities / products the totals cover. */
  entityCount: number;
  entityNoun: [singular: string, plural: string];
  href: string;
  progress: EvidenceProgress;
};

/**
 * Scoped by hand — the client is the admin client when an administrator is
 * previewing — to this importer's linked exporters, the facilities they own (as
 * /exporters counts them) and this importer's own products, with documents
 * limited by importerId inside fetchEvidenceProgress. Throws on any failed
 * query, so the card can say it could not load rather than show zeros.
 */
export async function loadEvidenceOverview(
  client: SupabaseLike,
  importerId: string
): Promise<EvidenceOverviewRow[]> {
  const { data: rels, error: relError } = await (client.from("supplier_relationships") as any)
    .select("supplier_id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", importerId)
    .in("status", ["active", "pending_invite"]);
  if (relError) throw new Error(`Evidence overview: relationships failed — ${relError.message}`);

  const supplierIds = [...new Set(
    ((rels ?? []) as Array<{ supplier_id: string | null }>)
      .map((r) => r.supplier_id)
      .filter((id): id is string => Boolean(id))
  )];

  const [facilitiesRes, productsRes] = await Promise.all([
    supplierIds.length > 0
      ? (client.from("facilities_verify") as any).select("id").in("supplier_id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
    (client.from("products_verify") as any).select("id").eq("importer_id", importerId),
  ]);
  if (facilitiesRes.error) throw new Error(`Evidence overview: facilities failed — ${facilitiesRes.error.message}`);
  if (productsRes.error) throw new Error(`Evidence overview: products failed — ${productsRes.error.message}`);

  const facilityIds = ((facilitiesRes.data ?? []) as Array<{ id: string }>).map((f) => f.id);
  const productIds = ((productsRes.data ?? []) as Array<{ id: string }>).map((p) => p.id);

  const [exporterProgress, facilityProgress, productProgress] = await Promise.all([
    fetchEvidenceProgress(client, "supplier", supplierIds, { importerId }),
    fetchEvidenceProgress(client, "facility", facilityIds, { importerId }),
    fetchEvidenceProgress(client, "product", productIds, { importerId }),
  ]);

  return [
    { label: "Exporters",  entityCount: supplierIds.length, entityNoun: ["exporter", "exporters"],   href: "/exporters",  progress: sumProgress(exporterProgress.values()) },
    { label: "Facilities", entityCount: facilityIds.length, entityNoun: ["facility", "facilities"], href: "/facilities", progress: sumProgress(facilityProgress.values()) },
    { label: "Products",   entityCount: productIds.length,  entityNoun: ["product", "products"],     href: "/products",   progress: sumProgress(productProgress.values()) },
  ];
}
