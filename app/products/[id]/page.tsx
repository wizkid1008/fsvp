import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ProductScoreCard } from "@/components/products/ProductScoreCard";
import { RequiredEvidenceChecklist } from "@/components/evidence/RequiredEvidenceChecklist";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupplierType } from "@/lib/supplier-context";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";


function approvalTone(status: string | null): StatusTone {
  if (status === "approved") return "success";
  if (status === "conditionally_approved") return "warning";
  if (status === "improvement_required" || status === "not_approved") return "danger";
  return "neutral";
}

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const { role, realRole, user } = await requireProfileRole(`/products/${params.id}`);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id")
    .eq("id", user.id)
    .maybeSingle();
  const ownSupplierId: string | null =
    role === "supplier" ? resolvePreviewedAccountId(realRole, profile?.supplier_id ?? null) : null;

  const { data: product } = await (supabase.from("products_verify") as any)
    .select("id, product_name, approval_status, supplier_id, facility_id, suppliers(company_name), facilities_verify(facility_name)")
    .eq("id", params.id)
    .maybeSingle();

  if (!product) notFound();

  return (
    <AppShell role={role} realRole={realRole} supplierType={await getSupplierType(supabase as any, ownSupplierId)}>
      <SectionHeader
        title={product.product_name}
        description={[product.suppliers?.company_name, product.facilities_verify?.facility_name].filter(Boolean).join(" · ") || "Product detail"}
      />

      <div className="mt-2 flex items-center gap-2">
        <StatusBadge tone={approvalTone(product.approval_status)}>
          {(product.approval_status ?? "pending").replace(/_/g, " ")}
        </StatusBadge>
        <Link href="/products" className="text-sm text-forest hover:underline">
          ← Back to all products
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        <ProductScoreCard productId={params.id} supabase={supabase} />

        <div className="space-y-6">
          <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <h2 className="text-base font-semibold text-ink">Required Documents</h2>
            <p className="mt-1 text-sm text-slate-500">
              These are the specific documents this product needs. Click "Upload" next to any missing or
              rejected item to attach it directly.
            </p>
            <RequiredEvidenceChecklist linkType="product" entityId={params.id} supplierId={product.supplier_id} supabase={supabase} />
          </section>

        </div>
      </div>
    </AppShell>
  );
}
