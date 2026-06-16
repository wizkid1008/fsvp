import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ProductScoreCard } from "@/components/products/ProductScoreCard";
import { DirectEntityUploadTile } from "@/components/evidence/DirectEntityUploadTile";
import { RequiredEvidenceChecklist } from "@/components/evidence/RequiredEvidenceChecklist";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupplierType } from "@/lib/supplier-context";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function evidenceTone(status: string | null): StatusTone {
  if (status === "accepted") return "success";
  if (status === "under_review") return "info";
  if (status === "submitted") return "warning";
  if (status === "needs_revision" || status === "rejected" || status === "expired") return "danger";
  return "neutral";
}

function approvalTone(status: string | null): StatusTone {
  if (status === "approved") return "success";
  if (status === "conditionally_approved") return "warning";
  if (status === "improvement_required" || status === "not_approved") return "danger";
  return "neutral";
}

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const { role, user } = await requireProfileRole(`/products/${params.id}`);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id")
    .eq("id", user.id)
    .maybeSingle();
  const ownSupplierId: string | null = role === "supplier" ? (profile?.supplier_id ?? null) : null;

  const { data: product } = await (supabase.from("products_verify") as any)
    .select("id, product_name, approval_status, supplier_id, facility_id, suppliers(company_name), facilities_verify(facility_name)")
    .eq("id", params.id)
    .maybeSingle();

  if (!product) notFound();

  const { data: productDocs } = await (supabase.from("documents") as any)
    .select("id, title, document_kind, evidence_status, uploaded_at, original_filename")
    .eq("linked_entity_type", "product")
    .eq("linked_entity_id", params.id)
    .is("soft_deleted_at", null)
    .order("uploaded_at", { ascending: false });

  return (
    <AppShell role={role} supplierType={await getSupplierType(supabase as any, ownSupplierId)}>
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

          <DirectEntityUploadTile linkType="product" entityId={params.id} supplierId={product.supplier_id} />

        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h2 className="text-base font-semibold text-ink">Documents tagged to this product</h2>
          <p className="mt-1 text-sm text-slate-500">
            These documents count toward this product's score.
          </p>
          {(productDocs ?? []).length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No documents are tagged to this product yet.
            </p>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-slate-50">
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Document</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Submitted</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(productDocs ?? []).map((doc: any) => (
                  <tr key={doc.id}>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-ink">{doc.title}</p>
                      {doc.original_filename && <p className="text-xs text-slate-400">{doc.original_filename}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {new Date(doc.uploaded_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={evidenceTone(doc.evidence_status)}>
                        {(doc.evidence_status ?? "not_submitted").replace(/_/g, " ")}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        </div>
      </div>
    </AppShell>
  );
}
