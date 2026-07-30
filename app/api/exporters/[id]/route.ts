// PATCH — edit an exporter record the caller's organization manages.
//
// Only permitted while record_mode <> 'self_managed'. Once the exporter claims
// their record they own their own profile, and the importer loses edit rights
// while keeping the relationship and all previously uploaded evidence.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

const EXPORT_ELIGIBLE = new Set(["exporter", "exporter_manufacturer", "trader"]);

function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["us_importer", "administrator"].includes(profile.role)) {
    return NextResponse.json({ error: "Only importers can edit managed exporter records." }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const { id } = params;

  const { data: supplier } = await (admin.from("suppliers") as any)
    .select("id, company_name, record_mode, managed_by_importer_id")
    .eq("id", id)
    .maybeSingle();

  if (!supplier) return NextResponse.json({ error: "Exporter not found." }, { status: 404 });

  if (supplier.record_mode === "self_managed") {
    return NextResponse.json(
      { error: `${supplier.company_name} manages their own record. Ask them to update it, or contact an administrator.` },
      { status: 403 }
    );
  }

  if (profile.role !== "administrator" && supplier.managed_by_importer_id !== profile.importer_id) {
    return NextResponse.json({ error: "Your organization does not manage this record." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    company_name?: string;
    legal_entity_name?: string;
    country?: string;
    supplier_type?: string;
    fda_registration_number?: string;
    duns_number?: string;
    website?: string;
    contact_name?: string;
    contact_email?: string;
  };

  const patch: Record<string, unknown> = {};

  if (body.company_name !== undefined) {
    const v = body.company_name.trim();
    if (!v) return NextResponse.json({ error: "Company name cannot be empty." }, { status: 400 });
    patch.company_name = v;
  }
  if (body.legal_entity_name !== undefined) patch.legal_entity_name = body.legal_entity_name.trim() || null;
  if (body.country !== undefined) {
    const v = body.country.trim();
    if (!v) return NextResponse.json({ error: "Country cannot be empty." }, { status: 400 });
    patch.country = v;
  }
  if (body.supplier_type !== undefined) {
    if (!EXPORT_ELIGIBLE.has(body.supplier_type)) {
      return NextResponse.json(
        { error: "An exporter must be an exporter, exporter-manufacturer, or trader. A pure manufacturer cannot ship directly to a U.S. importer." },
        { status: 400 }
      );
    }
    patch.supplier_type = body.supplier_type;
  }
  if (body.fda_registration_number !== undefined) patch.fda_registration_number = body.fda_registration_number.trim() || null;
  if (body.duns_number !== undefined) patch.duns_number = body.duns_number.trim() || null;
  if (body.website !== undefined) patch.website = normalizeWebsite(body.website);

  if (body.contact_name !== undefined || body.contact_email !== undefined) {
    patch.contact_json = {
      name:  body.contact_name?.trim() || null,
      email: body.contact_email?.trim().toLowerCase() || null,
    };
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { error } = await (admin.from("suppliers") as any).update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      supplier.managed_by_importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "exporter_record_updated",
    record_type:      "suppliers",
    record_id:        id,
    new_value:        patch,
  });

  return NextResponse.json({ ok: true });
}
