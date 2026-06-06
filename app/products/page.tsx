import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PackageSearch } from "lucide-react";

export const runtime = "edge";

export default async function ProductsPage() {
  const { user, role } = await requireProfileRole("/products");
  const supabase = createServerSupabaseClient();

  const { data: products } = await supabase
    .from("products_verify")
    .select("id, product_name, country_of_origin, intended_use, allergen_information, created_at, supplier_id, suppliers(company_name)")
    .order("created_at", { ascending: false });

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Products"
        description="Track every food product imported from your foreign suppliers — ingredients, allergens, intended use, and origin."
        action={{ label: "Add product", href: "/products/new" }}
      />

      {!products || products.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="No products yet"
          description="Add products to link them to suppliers, map FSVP requirements, and track verification evidence."
          action={{ label: "Add your first product", href: "/products/new" }}
        />
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Product</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Origin</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Intended Use</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Allergens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-ink">{product.product_name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {(product.suppliers as { company_name: string } | null)?.company_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{product.country_of_origin ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{product.intended_use?.replace(/_/g, " ") ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{product.allergen_information ?? "None declared"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
