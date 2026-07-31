import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const admin = createAdminSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  // See the note in hazard-items: a tenant-scoped reviewer is an FSVP qualified
  // individual, and the hazard analysis is their work product under § 1.503.
  if (!profile || !["us_importer", "administrator", "reviewer"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { fsvp_record_id } = body;
  if (!fsvp_record_id) return NextResponse.json({ error: "fsvp_record_id required" }, { status: 400 });

  // Verify this fsvp_record belongs to the importer
  const { data: record } = await (admin.from("fsvp_records") as any)
    .select("id, importer_id")
    .eq("id", fsvp_record_id)
    .maybeSingle();

  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  if (profile.role !== "administrator" && record.importer_id !== profile.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get next version number
  const { data: existing } = await (admin.from("fsvp_plan_hazard_analyses") as any)
    .select("version")
    .eq("fsvp_record_id", fsvp_record_id)
    .order("version", { ascending: false })
    .limit(1);

  const nextVersion = existing?.length > 0 ? existing[0].version + 1 : 1;

  const { data, error } = await (admin.from("fsvp_plan_hazard_analyses") as any).insert({
    fsvp_record_id,
    version: nextVersion,
    status: "draft",
    created_by_profile_id: user.id,
  }).select().maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
