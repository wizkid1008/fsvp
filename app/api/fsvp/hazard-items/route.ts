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

/**
 * Remove a hazard from a draft analysis.
 *
 * A hazard item had no way out: POST above was the only method, and the panel
 * rendered items as plain rows. A mistyped hazard was permanent through the UI,
 * which also made "Mark Final" a thing nobody could safely press.
 *
 * Only while the analysis is a draft. Once final it is the answer to § 1.504
 * that the checklist and the approval gate both read, and it is superseded by a
 * new version rather than quietly edited underneath them.
 */
export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const admin = createAdminSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["us_importer", "administrator", "reviewer"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const itemId = typeof body.id === "string" ? body.id.trim() : "";
  if (!itemId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: item } = await (admin.from("fsvp_plan_hazard_items") as any)
    .select(
      "id, hazard_name, hazard_type, hazard_analysis_id, " +
      "fsvp_plan_hazard_analyses!inner(status, fsvp_records!inner(importer_id, status))"
    )
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return NextResponse.json({ error: "Hazard not found" }, { status: 404 });

  const analysis = item.fsvp_plan_hazard_analyses as { status: string; fsvp_records: { importer_id: string; status: string } };
  const record = analysis.fsvp_records;

  if (profile.role !== "administrator" && record.importer_id !== profile.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (["importer_approved", "rejected"].includes(record.status)) {
    return NextResponse.json(
      { error: "This FSVP record has already been decided. Begin a reassessment to change its hazard analysis." },
      { status: 409 }
    );
  }

  if (analysis.status !== "draft") {
    return NextResponse.json(
      { error: "This hazard analysis is final. Reopen it before removing a hazard." },
      { status: 409 }
    );
  }

  const { error } = await (admin.from("fsvp_plan_hazard_items") as any).delete().eq("id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      record.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "hazard_item_removed",
    record_type:      "fsvp_plan_hazard_items",
    record_id:        itemId,
    previous_value:   { hazard_type: item.hazard_type, hazard_name: item.hazard_name },
    new_value:        { hazard_analysis_id: item.hazard_analysis_id },
  });

  return NextResponse.json({ ok: true });
}
