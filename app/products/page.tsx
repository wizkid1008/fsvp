import { AppShell } from "@/components/layout/AppShell";
import { ProductTable, type ProductRow } from "@/components/products/ProductTable";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Country } from "@/types/database";

export const runtime = "edge";

export default async function ProductsPage() {
  const { role } = await requireProfileRole("/products");
  const supabase = createServerSupabaseClient();

  const [{ data: rawProducts }, { data: countries }, { data: suppliers }, { data: documents }] = await Promise.all([
    (supabase.from("products_verify") as any)
      .select("id, product_name, product_description, country_of_origin, raw_or_processed, intended_use, ingredient_list, allergen_information, supplier_id, suppliers(company_name)")
      .order("created_at", { ascending: false }),
    (supabase.from("countries") as any)
      .select("country_code,country_name")
      .eq("is_active", true)
      .order("country_name"),
    (supabase.from("suppliers") as any)
      .select("id, company_name")
      .order("company_name"),
    supabase.from("documents")
      .select("linked_entity_type, linked_entity_id")
  ]);

  const evidenceCountByProduct = new Map<string, number>();
  for (const doc of (documents ?? []) as Array<{ linked_entity_type: string | null; linked_entity_id: string | null }>) {
    if (doc.linked_entity_type === "product" && doc.linked_entity_id) {
      evidenceCountByProduct.set(doc.linked_entity_id, (evidenceCountByProduct.get(doc.linked_entity_id) ?? 0) + 1);
    }
  }

  const products = ((rawProducts ?? []) as unknown as ProductRow[]).map((product) => ({
    ...product,
    evidence_count: evidenceCountByProduct.get(product.id) ?? 0
  }));
  const countryOptions = (countries ?? []) as Pick<Country, "country_code" | "country_name">[];
  const supplierOptions = (suppliers ?? []) as Array<{ id: string; company_name: string }>;

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Products"
        description="Track every food product imported from your foreign suppliers - ingredients, allergens, intended use, and origin."
      />
      <ProductTable countries={countryOptions} products={products} suppliers={supplierOptions} />
    </AppShell>
  );
}
