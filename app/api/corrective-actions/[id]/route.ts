// PATCH → update a corrective action
//   importer side: status, investigation_summary, action_taken, decision
//   exporter side: supplier_response only, on an action naming their company

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { deniesTenant } from "@/lib/auth/tenancy";

export const runtime = "edge";

const IMPORTER_ROLES = new Set(["us_importer", "reviewer", "administrator"]);
const EXPORTER_ROLES = new Set(["supplier", "exporter"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id, supplier_id")
    .eq("id", user.id)
    .maybeSingle();

  const isImporterSide = Boolean(profile && IMPORTER_ROLES.has(profile.role));
  const isExporterSide = Boolean(profile && EXPORTER_ROLES.has(profile.role));
  if (!isImporterSide && !isExporterSide) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();

  // This selected status_history, a column that does not exist, so the lookup
  // errored, `existing` was null, and every update answered "Not found".
  const { data: existing } = await (admin.from("corrective_actions") as any)
    .select("id, importer_id, supplier_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The admin client bypasses RLS, so who may touch this action is decided here.
  if (isImporterSide && deniesTenant(profile, existing.importer_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (isExporterSide && (!profile.supplier_id || profile.supplier_id !== existing.supplier_id)) {
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

  if (isExporterSide) {
    // An exporter answers; the importer decides. § 1.508 puts the corrective
    // action and its outcome on the importer, but the supplier's side of it —
    // what went wrong, what they changed — is theirs to state. Only that field.
    if (typeof supplier_response !== "string" || !supplier_response.trim()) {
      return NextResponse.json({ error: "Write a response before sending it." }, { status: 400 });
    }
    if (existing.status === "closed") {
      return NextResponse.json({ error: "This corrective action is closed." }, { status: 409 });
    }
    updates.supplier_response = supplier_response.trim();
  } else {
    if (investigation_summary !== undefined) updates.investigation_summary = investigation_summary;
    if (action_taken !== undefined) updates.action_taken = action_taken;
    if (supplier_response !== undefined) updates.supplier_response = supplier_response;
    if (decision !== undefined) updates.decision = decision;
    if (status && status !== existing.status) {
      updates.status = status;
      if (status === "closed") updates.closed_at = new Date().toISOString();
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true });
  }

  const { error } = await (admin.from("corrective_actions") as any)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The history of status changes lives here — previous and new value, who,
  // when — which is what the missing status_history column was meant to hold.
  await (admin.from("audit_logs") as any).insert({
    importer_id: existing.importer_id,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: isExporterSide ? "corrective_action_supplier_response" : "corrective_action_updated",
    record_type: "corrective_actions",
    record_id: id,
    previous_value: { status: existing.status },
    new_value: updates,
  });

  return NextResponse.json({ success: true });
}
