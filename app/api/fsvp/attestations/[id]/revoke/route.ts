// POST — withdraw an attestation.
//
// Revocation is the only mutation the ledger permits (enforce_qi_attestation_
// append_only()). The row stays, stamped with when and why, because an FSVP
// record that once carried a signature and no longer does is exactly the kind of
// thing an investigator is entitled to see.
//
// Either the qualified individual who signed it or an importer administrator may
// revoke: the QI because it is their signature, the administrator because a QI
// may have left.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/notify";
import { ATTESTATION_LABEL } from "@/lib/fsvp/qi-attestation";

export const runtime = "edge";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.importer_id) {
    return NextResponse.json({ error: "Your account is not linked to an importer organization." }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const { id } = params;

  const { data: attestation } = await (admin.from("qi_attestations") as any)
    .select("id, importer_id, fsvp_record_id, applicability_determination_id, attestation_type, signed_by_profile_id, revoked_at")
    .eq("id", id)
    .maybeSingle();

  if (!attestation) return NextResponse.json({ error: "Attestation not found." }, { status: 404 });
  if (attestation.importer_id !== profile.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (attestation.revoked_at) {
    return NextResponse.json({ error: "That attestation is already revoked." }, { status: 400 });
  }

  const isOwnSignature = attestation.signed_by_profile_id === user.id;
  const isImporterAdmin = ["us_importer", "administrator"].includes(profile.role);
  if (!isOwnSignature && !isImporterAdmin) {
    return NextResponse.json(
      { error: "Only the qualified individual who signed it, or an importer administrator, can revoke an attestation." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({})) as { reason?: string };
  const reason = body.reason?.trim() ?? "";
  if (!reason) {
    return NextResponse.json({ error: "Give a reason — a withdrawn signature without one is unreadable later." }, { status: 400 });
  }

  const { error } = await (admin.from("qi_attestations") as any)
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      attestation.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "qi_attestation_revoked",
    record_type:      "qi_attestations",
    record_id:        id,
    new_value:        { attestation_type: attestation.attestation_type, reason },
  });

  await notify(admin, {
    importerId: attestation.importer_id,
    type:       "qi_attestation_revoked",
    title:      "FSVP determination signature withdrawn",
    body:       `${ATTESTATION_LABEL[attestation.attestation_type as keyof typeof ATTESTATION_LABEL]} is no longer signed. Reason: ${reason}`,
    // An attestation targets either an FSVP record or an applicability
    // determination — 008 gave the ledger a second kind of target.
    targetUrl:  attestation.fsvp_record_id
      ? `/fsvp-records/${attestation.fsvp_record_id}`
      : "/applicability",
    severity:   "warning",
  });

  return NextResponse.json({ ok: true });
}
