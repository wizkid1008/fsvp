// POST { contact_email? } — reissue the claim invite for a managed exporter.
//
// Issues a fresh token, invalidating the previous link.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["us_importer", "administrator"].includes(profile.role)) {
    return NextResponse.json({ error: "Only importers can send claim invites." }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const { id } = params;

  const { data: supplier } = await (admin.from("suppliers") as any)
    .select("id, company_name, record_mode, managed_by_importer_id, contact_json")
    .eq("id", id)
    .maybeSingle();

  if (!supplier) return NextResponse.json({ error: "Exporter not found." }, { status: 404 });

  if (supplier.record_mode === "self_managed") {
    return NextResponse.json(
      { error: `${supplier.company_name} has already claimed their record.` },
      { status: 409 }
    );
  }

  if (profile.role !== "administrator" && supplier.managed_by_importer_id !== profile.importer_id) {
    return NextResponse.json({ error: "Your organization does not manage this record." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { contact_email?: string };
  const contactEmail =
    body.contact_email?.trim().toLowerCase() ||
    (supplier.contact_json?.email as string | undefined)?.trim().toLowerCase() ||
    "";

  if (!contactEmail || !isValidEmail(contactEmail)) {
    return NextResponse.json(
      { error: "A valid contact email is required to send a claim invite." },
      { status: 400 }
    );
  }

  const token = generateToken();

  const { error: updateError } = await (admin.from("suppliers") as any)
    .update({
      record_mode:          "claim_pending",
      claim_invite_token:   token,
      claim_invite_sent_at: new Date().toISOString(),
      claim_declined_at:    null,
      contact_json:         { ...(supplier.contact_json ?? {}), email: contactEmail },
    })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  try {
    const claimUrl = new URL(`/claim-exporter?token=${token}`, req.url).toString();

    const { data: existingProfile } = await (admin.from("profiles") as any)
      .select("id")
      .ilike("email", contactEmail)
      .maybeSingle();

    if (!existingProfile) {
      await admin.auth.admin.inviteUserByEmail(contactEmail, {
        data: { organization_name: supplier.company_name, role: "supplier" },
        redirectTo: claimUrl,
      });
    }
  } catch {
    // Non-fatal — the token is live and the link can be shared manually.
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      supplier.managed_by_importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "exporter_claim_invite_sent",
    record_type:      "suppliers",
    record_id:        id,
    new_value:        { contact_email: contactEmail },
  });

  return NextResponse.json({ ok: true });
}
