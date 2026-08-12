import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isCrossTenant } from "@/lib/auth/tenancy";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, supplier_id, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const ownSupplierId: string | null = profile?.supplier_id ?? null;

  const body = await request.json().catch(() => ({}));
  const { facility_id, supplier_ids, ...facilityPayload } = body as {
    facility_id?: string;
    supplier_ids: string[];
    [key: string]: unknown;
  };

  if (!supplier_ids || supplier_ids.length === 0) {
    return NextResponse.json({ error: "At least one supplier is required." }, { status: 400 });
  }
  if (!facilityPayload.facility_name || !facilityPayload.facility_type) {
    return NextResponse.json({ error: "Facility name and type are required." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // Verify the caller owns, or is linked to, each requested supplier.
  //
  // The importer case was missing entirely, which made this endpoint reject
  // EVERY facility a US importer tried to create. An importer has no
  // profiles.supplier_id, so `ownSupplierId` is null; the linked-supplier query
  // then ran as `exporter_id = null`, which matches no row in SQL, and it only
  // considered exporter_supplier/self_supply links — never the
  // importer_supplier link that an importer actually holds. Every supplier_id
  // therefore fell through to the 403 below. Because a product requires a
  // facility, that also blocked products: the whole supply chain stopped at the
  // first step after adding an exporter.
  //
  // Mirrors the authorization in app/api/products/save/route.ts.
  const isPlatformWide = isCrossTenant(profile);

  for (const sid of supplier_ids) {
    if (isPlatformWide) break;
    if (ownSupplierId && sid === ownSupplierId) continue;

    // Exporter acting for one of its own upstream suppliers.
    let authorized = false;
    if (ownSupplierId) {
      const { data: exporterLink } = await (admin.from("supplier_relationships") as any)
        .select("id")
        .eq("exporter_id", ownSupplierId)
        .eq("supplier_id", sid)
        .in("relationship_type", ["exporter_supplier", "self_supply"])
        .in("status", ["active", "pending_invite"])
        .maybeSingle();
      authorized = !!exporterLink;
    }

    // Importer acting for an exporter it has linked or created. Pending invites
    // count: an importer maintains records for an exporter that has not
    // registered, which is the whole point of a managed exporter record.
    if (!authorized && profile.importer_id) {
      const { data: importerLink } = await (admin.from("supplier_relationships") as any)
        .select("id")
        .eq("relationship_type", "importer_supplier")
        .eq("importer_id", profile.importer_id)
        .eq("supplier_id", sid)
        .in("status", ["active", "pending_invite"])
        .maybeSingle();
      authorized = !!importerLink;
    }

    if (!authorized) {
      return NextResponse.json({ error: "You are not authorized to add facilities for one of the selected suppliers." }, { status: 403 });
    }
  }

  const primarySupplierId = supplier_ids[0];
  const payload = {
    ...facilityPayload,
    supplier_id: primarySupplierId,
    ...(profile?.importer_id ? { importer_id: profile.importer_id } : {}),
  };

  let facilityId: string;

  if (facility_id) {
    const { data, error } = await (admin.from("facilities_verify") as any)
      .update(payload)
      .eq("id", facility_id)
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    facilityId = data.id;
  } else {
    const { data, error } = await (admin.from("facilities_verify") as any)
      .insert(payload)
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    facilityId = data.id;
  }

  // Sync facility_supplier_access
  await (admin.from("facility_supplier_access") as any)
    .delete()
    .eq("facility_id", facilityId);

  const accessRows = supplier_ids.map((sid) => ({
    facility_id: facilityId,
    supplier_id: sid,
    importer_id: profile?.importer_id ?? null,
    access_level: "manage",
  }));

  if (accessRows.length > 0) {
    const { error: accessError } = await (admin.from("facility_supplier_access") as any)
      .upsert(accessRows, { onConflict: "facility_id,supplier_id" });
    if (accessError) return NextResponse.json({ error: accessError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, facility_id: facilityId });
}
