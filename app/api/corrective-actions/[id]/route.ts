// PATCH → update a corrective action (status, investigation_summary, action_taken, decision)

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

const ALLOWED_ROLES = new Set(["us_importer", "reviewer", "administrator"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
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

  const { data: existing } = await (admin.from("corrective_actions") as any)
    .select("id, importer_id, status, status_history")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (profile.role === "us_importer" && existing.importer_id !== profile.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { status, investigation_summary, action_taken, supplier_response, decision } = body as {
    status?: string;
    investigation_summary?: string;
    action_taken?: string;
    supplier_response?: string;
    decision?: string;
  };

  const updates: Record<string, unknown> = {};
  if (investigation_summary !== undefined) updates.investigation_summary = investigation_summary;
  if (action_taken !== undefined) updates.action_taken = action_taken;
  if (supplier_response !== undefined) updates.supplier_response = supplier_response;
  if (decision !== undefined) updates.decision = decision;

  if (status && status !== existing.status) {
    updates.status = status;
    if (status === "closed") {
      updates.closed_at = new Date().toISOString();
    }
    const history = Array.isArray(existing.status_history) ? existing.status_history : [];
    updates.status_history = [
      ...history,
      { from: existing.status, to: status, at: new Date().toISOString(), by: user.id },
    ];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true });
  }

  const { error } = await (admin.from("corrective_actions") as any)
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id: existing.importer_id,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: "corrective_action_updated",
    record_type: "corrective_actions",
    record_id: id,
    previous_value: { status: existing.status },
    new_value: updates,
  });

  return NextResponse.json({ success: true });
}
