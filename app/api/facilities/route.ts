import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ACTIVE_LINK_STATUSES, firstDeniedSupplierId } from "@/lib/auth/entity-access";

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

  // Verify the caller owns, or is linked to, every requested supplier. The rule
  // itself lives in lib/auth/entity-access.ts so it can be tested and so this
  // route and /api/products/save cannot drift apart again — they had, and the
  // importer case was missing here entirely.
  //
  // One query for all requested suppliers rather than one per supplier: the
  // decision only needs the rows, not a separate round trip each.
  const { data: linkRows } = await (admin.from("supplier_relationships") as any)
    .select("relationship_type, status, supplier_id, exporter_id, importer_id")
    .in("supplier_id", supplier_ids)
    .in("status", ACTIVE_LINK_STATUSES as unknown as string[]);

  const denied = firstDeniedSupplierId(profile, supplier_ids, linkRows ?? []);
  if (denied) {
    return NextResponse.json(
      { error: "You are not authorized to add facilities for one of the selected suppliers." },
      { status: 403 }
    );
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
