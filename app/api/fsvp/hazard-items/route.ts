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

  // Reviewers are included because a tenant-scoped reviewer is how an FSVP
  // qualified individual holds a login (see 004_reviewer_tenancy.sql). The
  // hazard analysis is the QI's own work product under § 1.503, so they must be
  // able to author it — the importer_id check below still confines them to
  // their own tenant, and a platform reviewer (no importer_id) fails it.
  // Approving the record remains us_importer/administrator only.
  if (!profile || !["us_importer", "administrator", "reviewer"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    hazard_analysis_id, hazard_type, hazard_name,
    requires_control, severity, is_sahcodha,
    controlling_entity, controls_description,
  } = body;

  if (!hazard_analysis_id || !hazard_type || !hazard_name) {
    return NextResponse.json({ error: "hazard_analysis_id, hazard_type, hazard_name required" }, { status: 400 });
  }

  // Verify ownership via fsvp_records
  const { data: analysis } = await (admin.from("fsvp_plan_hazard_analyses") as any)
    .select("id, fsvp_records!inner(importer_id)")
    .eq("id", hazard_analysis_id)
    .maybeSingle();

  if (!analysis) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  const importerId = (analysis.fsvp_records as any).importer_id;
  if (profile.role !== "administrator" && importerId !== profile.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await (admin.from("fsvp_plan_hazard_items") as any).insert({
    hazard_analysis_id,
    hazard_type,
    hazard_name,
    requires_control: requires_control ?? false,
    severity: severity ?? null,
    is_sahcodha: is_sahcodha ?? false,
    controlling_entity: controlling_entity ?? null,
    controls_description: controls_description ?? null,
    known_or_reasonably_foreseeable: true,
  }).select().maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
