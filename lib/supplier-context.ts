// Supplier type constants and utilities shared across all pages.
// A supplier entity can play two very different roles:
//   - Exporter/Trader: export-eligible, holds the importer relationship
//   - Manufacturer/Broker: upstream supplier, flows through an exporter

export const EXPORTER_TYPES = ["exporter", "exporter_manufacturer", "trader"] as const;
export const MANUFACTURER_TYPES = ["manufacturer", "broker"] as const;

export type SupplierType =
  | "exporter"
  | "exporter_manufacturer"
  | "trader"
  | "manufacturer"
  | "broker";

export function isExporterType(supplierType: string | null | undefined): boolean {
  return EXPORTER_TYPES.includes(supplierType as any);
}

export function isManufacturerType(supplierType: string | null | undefined): boolean {
  return MANUFACTURER_TYPES.includes(supplierType as any);
}

export function supplierTypeLabel(supplierType: string | null | undefined): string {
  switch (supplierType) {
    case "exporter":              return "Exporter";
    case "exporter_manufacturer": return "Exporter & Manufacturer";
    case "trader":                return "Trader";
    case "manufacturer":          return "Manufacturer";
    case "broker":                return "Broker";
    default:                      return "Supplier";
  }
}

export function supplierRoleLabel(supplierType: string | null | undefined): string {
  return isExporterType(supplierType) ? "Exporter" : "Supplier";
}

/** Fetch the supplier_type for a given supplierId. Returns null if not found. */
export async function getSupplierType(
  supabase: { from: (table: string) => any },
  supplierId: string | null | undefined
): Promise<string | null> {
  if (!supplierId) return null;
  const { data } = await (supabase.from("suppliers") as any)
    .select("supplier_type")
    .eq("id", supplierId)
    .maybeSingle();
  return data?.supplier_type ?? null;
}

/** Full supplier context for a logged-in supplier-role user. */
export async function getSupplierContext(
  supabase: { from: (table: string) => any },
  userId: string
): Promise<{
  supplierId:    string | null;
  supplierType:  string | null;
  isExporter:    boolean;
  isManufacturer: boolean;
  companyName:   string | null;
}> {
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id, organization_name")
    .eq("id", userId)
    .maybeSingle();

  const supplierId = profile?.supplier_id ?? null;
  if (!supplierId) {
    return { supplierId: null, supplierType: null, isExporter: false, isManufacturer: false, companyName: profile?.organization_name ?? null };
  }

  const { data: supplier } = await (supabase.from("suppliers") as any)
    .select("supplier_type, company_name")
    .eq("id", supplierId)
    .maybeSingle();

  const supplierType  = supplier?.supplier_type ?? "exporter";
  return {
    supplierId,
    supplierType,
    isExporter:    isExporterType(supplierType),
    isManufacturer: isManufacturerType(supplierType),
    companyName:   supplier?.company_name ?? profile?.organization_name ?? null,
  };
}
