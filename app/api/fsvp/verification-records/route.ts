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

  if (!profile || !["us_importer", "administrator"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    fsvp_record_id, activity_type, scheduled_date,
    performed_by_name, next_due_at, is_sahcodha_audit, result_notes,
  } = body;

  if (!fsvp_record_id || !activity_type) {
    return NextResponse.json({ error: "fsvp_record_id and activity_type required" }, { status: 400 });
  }

  const { data: record } = await (admin.from("fsvp_records") as any)
    .select("id, importer_id")
    .eq("id", fsvp_record_id)
    .maybeSingle();

  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  if (profile.role !== "administrator" && record.importer_id !== profile.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await (admin.from("fsvp_verification_records") as any).insert({
    fsvp_record_id,
    activity_type,
    scheduled_date: scheduled_date ?? null,
    performed_by_name: performed_by_name ?? null,
    next_due_at: next_due_at ?? null,
    is_sahcodha_audit: is_sahcodha_audit ?? false,
    result_notes: result_notes ?? null,
    status: "planned",
    created_by_profile_id: user.id,
  }).select().maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
