// GET /api/reviewer/entity-context?type=facility|product&id=<uuid>
// Returns entity details + all documents linked to that entity, for the reviewer slide-out panel.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isCrossTenant } from "@/lib/auth/tenancy";

export const runtime = "edge";

/**
 * Whether a tenant-confined caller may see this entity.
 *
 * An entity belongs to the caller's tenant either directly, by importer_id, or
 * through a relationship with the supplier that owns it — an exporter's own
 * facility carries no importer_id at all, so the relationship is the only link.
 */
async function entityIsVisible(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  importerId: string,
  entity: { importer_id?: string | null; supplier_id?: string | null }
): Promise<boolean> {
  if (entity.importer_id && entity.importer_id === importerId) return true;
  if (!entity.supplier_id) return false;

  const { data: link } = await (admin.from("supplier_relationships") as any)
    .select("id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", importerId)
    .eq("supplier_id", entity.supplier_id)
    .maybeSingle();

  return Boolean(link);
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    // importer_id, not just role: a reviewer means two different things
    // depending on whether they carry one. See lib/auth/tenancy.ts.
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!["reviewer", "administrator"].includes(profile?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // A reviewer WITH an importer_id is that tenant's qualified individual, not a
  // platform-wide reviewer. This route previously accepted any reviewer and
  // fetched any facility or product by id with the admin client, which meant a
  // QI at one importer could read another importer's entities and every
  // document attached to them by supplying a UUID. RLS could not catch it —
  // the admin client bypasses RLS, so the check has to be here.
  const crossTenant = isCrossTenant(profile);
  if (!crossTenant && !profile?.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get("type");
  const id   = req.nextUrl.searchParams.get("id");

  if (!type || !id || !["facility", "product"].includes(type)) {
    return NextResponse.json({ error: "type (facility|product) and id are required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  if (type === "facility") {
    const [entityRes, docsRes] = await Promise.all([
      (admin.from("facilities_verify") as any)
        .select("id, facility_name, facility_type, facility_address_json, fda_registration_number, food_safety_certifications, approval_status, importer_id, supplier_id, suppliers(company_name)")
        .eq("id", id)
        .maybeSingle(),
      (admin.from("documents") as any)
        .select("id, title, document_kind, evidence_status, uploaded_at, expiration_date")
        .eq("facility_id", id)
        .is("soft_deleted_at", null)
        .order("uploaded_at", { ascending: false }),
    ]);

    const entity = entityRes.data;
    if (!entity) return NextResponse.json({ error: "Facility not found" }, { status: 404 });

    // 404 rather than 403: telling an unauthorised caller that an id exists is
    // itself a disclosure, and this endpoint takes a guessable identifier.
    if (!crossTenant && !(await entityIsVisible(admin, profile.importer_id, entity))) {
      return NextResponse.json({ error: "Facility not found" }, { status: 404 });
    }

    return NextResponse.json({
      entity: {
        type:         "facility",
        name:         entity.facility_name,
        subtype:      entity.facility_type ?? null,
        location:     entity.facility_address_json?.country ?? entity.facility_address_json?.city ?? null,
        fda_reg:      entity.fda_registration_number ?? null,
        certifications: entity.food_safety_certifications ?? null,
        status:       entity.approval_status ?? null,
        supplier_name: (entity.suppliers as any)?.company_name ?? null,
      },
      documents: (docsRes.data ?? []),
    });
  }

  // product
  const [entityRes, docsRes] = await Promise.all([
    (admin.from("products_verify") as any)
      .select("id, product_name, country_of_origin, raw_or_processed, intended_use, approval_status, importer_id, supplier_id, suppliers(company_name), facilities_verify(facility_name)")
      .eq("id", id)
      .maybeSingle(),
    (admin.from("documents") as any)
      .select("id, title, document_kind, evidence_status, uploaded_at, expiration_date")
      .eq("linked_entity_id", id)
      .eq("linked_entity_type", "product")
      .is("soft_deleted_at", null)
      .order("uploaded_at", { ascending: false }),
  ]);

  const entity = entityRes.data;
  if (!entity) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  if (!crossTenant && !(await entityIsVisible(admin, profile.importer_id, entity))) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  return NextResponse.json({
    entity: {
      type:         "product",
      name:         entity.product_name,
      subtype:      entity.raw_or_processed ?? null,
      location:     entity.country_of_origin ?? null,
      fda_reg:      null,
      certifications: null,
      status:       entity.approval_status ?? null,
      supplier_name: (entity.suppliers as any)?.company_name ?? null,
      facility_name: (entity.facilities_verify as any)?.facility_name ?? null,
    },
    documents: (docsRes.data ?? []),
  });
}
