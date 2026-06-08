// PATCH { hazard_analysis_notes?, supplier_evaluation_notes?,
//         facility_evaluation_notes?, verification_determination?, status? }

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

const ALLOWED_ROLES = new Set(["us_importer", "reviewer", "administrator"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const admin = createAdminSupabaseClient();
  const { id } = params;

  const { data: existing } = await (admin.from("fsvp_records") as any)
    .select("importer_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  if (existing.importer_id !== profile.importer_id && profile.role !== "administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const ALLOWED_FIELDS = [
    "hazard_analysis_notes",
    "supplier_evaluation_notes",
    "facility_evaluation_notes",
    "verification_determination",
    "status",
  ];
  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await (admin.from("fsvp_records") as any)
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id: existing.importer_id,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: "fsvp_record_updated",
    record_type: "fsvp_records",
    record_id: id,
    new_value: updates,
  });

  return NextResponse.json({ success: true });
}
