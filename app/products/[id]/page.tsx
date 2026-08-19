import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ProductScoreCard } from "@/components/products/ProductScoreCard";
import {
  AdmissibilityPanel,
  type AdmissibilityDeterminationRow,
  type ClassificationRequestRow,
  type ProductCommodityOption,
} from "@/components/products/AdmissibilityPanel";
import { ProductFdaCodeCard } from "@/components/products/ProductFdaCodeCard";
import { RequiredEvidenceChecklist } from "@/components/evidence/RequiredEvidenceChecklist";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupplierType } from "@/lib/supplier-context";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import type { StatusTone } from "@/types/platform";
import { evaluateAdmissibility } from "@/lib/admissibility/gate";
import { fetchApprovalStatusMap } from "@/lib/scoring";

export const runtime = "edge";


function approvalTone(status: string | null): StatusTone {
  if (status === "approved" || status === "importer_approved") return "success";
  if (status === "conditionally_approved") return "warning";
  if (status === "improvement_required" || status === "not_approved") return "danger";
  return "neutral";
}

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const { role, realRole, user } = await requireProfileRole(`/products/${params.id}`);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id, importer_id")
    .eq("id", user.id)
    .maybeSingle();
  const ownSupplierId: string | null =
    role === "supplier" ? resolvePreviewedAccountId(realRole, profile?.supplier_id ?? null) : null;

  const { data: product } = await (supabase.from("products_verify") as any)
    .select("id, product_name, approval_status, supplier_id, facility_id, commodity_id, country_of_origin, intended_use, raw_or_processed, suppliers(company_name), facilities_verify(facility_name), commodities(common_name, scientific_name, plant_part, is_propagative)")
    .eq("id", params.id)
    .maybeSingle();

  if (!product) notFound();

  const isSupplierView = role === "supplier" || role === "exporter";
  const { data: productFdaCode, error: productFdaCodeError } = !isSupplierView
    ? await (supabase.from("products_verify") as any)
        .select("fda_product_code, fda_subclass_code, fda_pic_code, fda_product_code_verified_at")
        .eq("id", params.id)
        .maybeSingle()
    : { data: null, error: null };
  const hasFdaCodeColumns = !productFdaCodeError;

  const [commoditiesResult, determinationsResult, scoreStatusMap, admissibilityBlocks, requestResult] = await Promise.all([
    (supabase.from("commodities") as any)
      .select("id, common_name, scientific_name, plant_part, is_propagative")
      .eq("active", true)
      .order("common_name"),
    (supabase.from("admissibility_determinations_status") as any)
      .select("id, intended_use, processing_state, outcome, citation, source_url, conditions, determined_at, expires_at, is_current, rule_superseded")
      .eq("product_id", params.id)
      .is("superseded_at", null)
      .order("determined_at", { ascending: false }),
    fetchApprovalStatusMap(supabase as any, "product", [params.id]),
    isSupplierView
      ? Promise.resolve([])
      : evaluateAdmissibility(supabase as any, {
          productId: params.id,
          commodityId: product.commodity_id,
          countryOfOrigin: product.country_of_origin,
        }),
    // Only the latest matters. A declined request followed by a better one
    // should show the newer answer, not the older refusal.
    (supabase.from("commodity_classification_requests") as any)
      .select("id, status, described_as, resolution_note, resolved_commodity_id, created_at, commodities:resolved_commodity_id(common_name)")
      .eq("product_id", params.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const scoredStatus = scoreStatusMap.get(params.id) ?? product.approval_status ?? "pending";
  const gatedStatus = admissibilityBlocks.length > 0 ? "not_approved" : scoredStatus;
  const commodity = product.commodities as {
    common_name: string;
    scientific_name: string | null;
    plant_part: string | null;
    is_propagative: boolean;
  } | null;
  const commodityName = commodity
    ? [
        commodity.common_name,
        commodity.plant_part && commodity.plant_part !== "not_applicable" ? `(${commodity.plant_part})` : null,
        commodity.is_propagative ? "— propagative" : null,
      ].filter(Boolean).join(" ")
    : null;
  const canManageAdmissibility = realRole === "us_importer" && Boolean(profile?.importer_id);

  const rawRequest = requestResult?.data as
    | (Omit<ClassificationRequestRow, "resolved_commodity_name"> & { commodities: { common_name: string } | null })
    | null
    | undefined;
  const classificationRequest: ClassificationRequestRow | null = rawRequest
    ? {
        id: rawRequest.id,
        status: rawRequest.status,
        described_as: rawRequest.described_as,
        resolution_note: rawRequest.resolution_note,
        resolved_commodity_id: rawRequest.resolved_commodity_id,
        resolved_commodity_name: rawRequest.commodities?.common_name ?? null,
        created_at: rawRequest.created_at,
      }
    : null;
  const defaultUse = product.intended_use === "ready_to_eat"
    ? "consumption"
    : ["further_processed", "ingredient"].includes(product.intended_use ?? "")
      ? "processing"
      : "";

  return (
    <AppShell role={role} realRole={realRole} supplierType={await getSupplierType(supabase as any, ownSupplierId)}>
      <SectionHeader
        title={product.product_name}
        description={[product.suppliers?.company_name, product.facilities_verify?.facility_name].filter(Boolean).join(" · ") || "Product detail"}
      />

      <div className="mt-2 flex items-center gap-2">
        <StatusBadge tone={approvalTone(gatedStatus)}>
          {gatedStatus.replace(/_/g, " ")}
        </StatusBadge>
        <Link href="/products" className="text-sm text-forest hover:underline">
          ← Back to all products
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_1fr]">
        <ProductScoreCard productId={params.id} supabase={supabase} admissibilityBlocks={admissibilityBlocks} />

        <div className="space-y-6">
          {!isSupplierView && (
            <AdmissibilityPanel
              productId={params.id}
              productName={product.product_name}
              commodityId={product.commodity_id}
              commodityName={commodityName}
              countryOfOrigin={product.country_of_origin}
              commodities={(commoditiesResult.data ?? []) as ProductCommodityOption[]}
              determinations={(determinationsResult.data ?? []) as AdmissibilityDeterminationRow[]}
              blockers={admissibilityBlocks}
              canManage={canManageAdmissibility}
              defaultUse={defaultUse}
              defaultState=""
              classificationRequest={classificationRequest}
            />
          )}

          {!isSupplierView && hasFdaCodeColumns && (
            <ProductFdaCodeCard
              productId={params.id}
              canManage={canManageAdmissibility}
              current={{
                code:        productFdaCode?.fda_product_code ?? null,
                subclass:    productFdaCode?.fda_subclass_code ?? null,
                pic:         productFdaCode?.fda_pic_code ?? null,
                verified_at: productFdaCode?.fda_product_code_verified_at ?? null,
              }}
            />
          )}

          <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <h2 className="text-base font-semibold text-ink">Required Documents</h2>
            <p className="mt-1 text-sm text-slate-500">
              These are the specific records this product needs. Create platform-authored records where
              available, or upload an existing document next to any missing or rejected item.
            </p>
            <RequiredEvidenceChecklist
              linkType="product"
              entityId={params.id}
              supplierId={product.supplier_id}
              supabase={supabase}
              allowGeneratedActions={!isSupplierView}
            />
          </section>

        </div>
      </div>
    </AppShell>
  );
}
