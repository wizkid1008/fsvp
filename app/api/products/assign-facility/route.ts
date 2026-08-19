import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { refusePreviewWrite } from "@/lib/auth/preview-guard";
import { ACTIVE_LINK_STATUSES, canWriteSupplierEntity } from "@/lib/auth/entity-access";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, supplier_id, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 403 });

  const previewRefusal = refusePreviewWrite(profile.role, "assign a product to a facility");
  if (previewRefusal) return previewRefusal;

  const body = await req.json().catch(() => ({})) as {
    product_id?: string;
    facility_id?: string;
  };

  const productId = body.product_id?.trim();
  const facilityId = body.facility_id?.trim();
  if (!productId || !facilityId) {
    return NextResponse.json({ error: "Choose both a product and a facility." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: product } = await (admin.from("products_verify") as any)
    .select("id, supplier_id, facility_id, country_of_origin")
    .eq("id", productId)
    .maybeSingle();

  if (!product) return NextResponse.json({ error: "That product does not exist." }, { status: 404 });
  if (!product.supplier_id) {
    return NextResponse.json({ error: "This product needs a supplier before it can be assigned to a facility." }, { status: 400 });
  }

  const { data: linkRows } = await (admin.from("supplier_relationships") as any)
    .select("relationship_type, status, supplier_id, exporter_id, importer_id")
    .eq("supplier_id", product.supplier_id)
    .in("status", ACTIVE_LINK_STATUSES as unknown as string[]);

  if (!canWriteSupplierEntity(profile, product.supplier_id, linkRows ?? [])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: facility }, { data: access }] = await Promise.all([
    (admin.from("facilities_verify") as any)
      .select("id, supplier_id, facility_address_json")
      .eq("id", facilityId)
      .maybeSingle(),
    (admin.from("facility_supplier_access") as any)
      .select("facility_id")
      .eq("facility_id", facilityId)
      .eq("supplier_id", product.supplier_id)
      .maybeSingle(),
  ]);

  if (!facility || (facility.supplier_id !== product.supplier_id && !access)) {
    return NextResponse.json(
      { error: "Select a facility that is available to this product's supplier." },
      { status: 400 }
    );
  }

  const facilityCountry = (facility.facility_address_json as { country?: string } | null)?.country ?? null;
  const update: Record<string, unknown> = {
    facility_id: facilityId,
    updated_at: new Date().toISOString(),
  };
  if (!product.country_of_origin && facilityCountry) update.country_of_origin = facilityCountry;

  const { error } = await (admin.from("products_verify") as any)
    .update(update)
    .eq("id", productId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id: profile.importer_id ?? null,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: "product_facility_assigned",
    record_type: "products_verify",
    record_id: productId,
    previous_value: { facility_id: product.facility_id },
    new_value: { facility_id: facilityId, country_of_origin: update.country_of_origin ?? product.country_of_origin },
  });

  return NextResponse.json({ ok: true, facility_id: facilityId });
}
