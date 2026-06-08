// POST { document_id, decision, notes, expiration_date? }
// Reviewer or importer accepts / requests revision / rejects a document.
// On acceptance, triggers score recalculation for the linked entity.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

type Decision = "under_review" | "accepted" | "needs_revision" | "rejected";

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
  const { document_id, decision, notes, expiration_date } = body as {
    document_id: string;
    decision: Decision;
    notes?: string;
    expiration_date?: string;
  };

  if (!document_id || !decision) {
    return NextResponse.json({ error: "document_id and decision required" }, { status: 400 });
  }

  const validDecisions: Decision[] = ["under_review", "accepted", "needs_revision", "rejected"];
  if (!validDecisions.includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // Fetch the document to check it exists and get entity info
  const { data: doc } = await (admin.from("documents") as any)
    .select("id, title, evidence_status, facility_id, linked_entity_type, linked_entity_id, rule_version_id, supplier_id")
    .eq("id", document_id)
    .is("soft_deleted_at", null)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const previousStatus = doc.evidence_status;

  // Build update payload
  const updates: Record<string, unknown> = {
    evidence_status: decision,
    reviewer_profile_id: user.id,
    review_notes: notes ?? null,
  };
  if (decision === "accepted" && expiration_date) {
    updates.expiration_date = expiration_date;
  }
  // Keep approval_status in sync for backward compat
  updates.approval_status = decision === "accepted" ? "accepted"
    : decision === "needs_revision" ? "revision_required"
    : decision === "rejected" ? "rejected"
    : "under_review";

  const { error: updateErr } = await (admin.from("documents") as any)
    .update(updates)
    .eq("id", document_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Audit log
  await (admin.from("audit_logs") as any).insert({
    importer_id: profile.importer_id ?? null,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: `evidence_${decision}`,
    record_type: "documents",
    record_id: document_id,
    previous_value: { evidence_status: previousStatus },
    new_value: { evidence_status: decision, notes: notes ?? null },
  });

  // Trigger score recalculation if evidence was accepted or rejected
  // (scores become stale via DB trigger, but we also fire the recalc now
  //  so the result is fresh for the next page load)
  const ruleVersionId = doc.rule_version_id;
  if (ruleVersionId && (decision === "accepted" || decision === "rejected")) {
    const baseUrl = req.nextUrl.origin;
    // Fire-and-forget — don't block the response
    if (doc.facility_id) {
      fetch(`${baseUrl}/api/scoring/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") ?? "" },
        body: JSON.stringify({ entity_type: "facility", entity_id: doc.facility_id, rule_version_id: ruleVersionId }),
      }).catch(() => {});
    }
    if (doc.linked_entity_type === "product" && doc.linked_entity_id) {
      fetch(`${baseUrl}/api/scoring/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: req.headers.get("cookie") ?? "" },
        body: JSON.stringify({ entity_type: "product", entity_id: doc.linked_entity_id, rule_version_id: ruleVersionId }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ success: true, evidence_status: decision });
}
