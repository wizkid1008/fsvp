// POST { document_id, link_type, facility_id? }
// Reviewer/importer/admin re-tags a document between supplier-wide ("macro" /
// exporter-level) evidence and a specific facility, after upload.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

const ALLOWED_ROLES = new Set(["reviewer", "administrator", "us_importer"]);

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.has(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { document_id, link_type, facility_id } = body as {
    document_id: string;
    link_type: "supplier" | "facility";
    facility_id?: string;
  };

  if (!document_id || !link_type) {
    return NextResponse.json({ error: "document_id and link_type required" }, { status: 400 });
  }
  if (link_type === "facility" && !facility_id) {
    return NextResponse.json({ error: "facility_id required when re-tagging to a facility" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: doc } = await (admin.from("documents") as any)
    .select("id, supplier_id, linked_entity_type, linked_entity_id, facility_id")
    .eq("id", document_id)
    .is("soft_deleted_at", null)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  if (link_type === "facility") {
    const facility = await (admin.from("facilities_verify") as any)
      .select("id, supplier_id")
      .eq("id", facility_id)
      .maybeSingle();

    if (facility.error || !facility.data) {
      return NextResponse.json({ error: "Facility not found" }, { status: 404 });
    }
  }

  const previousLink = { linked_entity_type: doc.linked_entity_type, facility_id: doc.facility_id };

  const updates =
    link_type === "facility"
      ? { linked_entity_type: "facility", linked_entity_id: facility_id, facility_id }
      : { linked_entity_type: "supplier", linked_entity_id: doc.supplier_id, facility_id: null };

  const { error: updateErr } = await (admin.from("documents") as any)
    .update(updates)
    .eq("id", document_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id: profile.importer_id ?? null,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: "document_relinked",
    record_type: "documents",
    record_id: document_id,
    previous_value: previousLink,
    new_value: updates,
  });

  return NextResponse.json({ success: true });
}
