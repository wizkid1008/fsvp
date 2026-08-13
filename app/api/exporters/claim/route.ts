// GET  ?token=…            — look up a pending claim (used by /claim-exporter)
// POST { token, decline? } — accept or decline ownership of a managed record
//
// When an importer creates an exporter record they may invite the exporter to
// claim it. Accepting transfers ownership: record_mode becomes 'self_managed',
// the importer loses profile-edit rights, and the relationship plus every
// document uploaded on the exporter's behalf stays exactly as it is. History is
// not rewritten — evidence keeps whatever evidence_source it was recorded with.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!token) return NextResponse.json({ error: "Token required." }, { status: 400 });

  const admin = createAdminSupabaseClient();

  const { data: supplier } = await (admin.from("suppliers") as any)
    .select("id, company_name, legal_entity_name, country, record_mode, managed_by_importer_id, contact_json")
    .eq("claim_invite_token", token)
    .maybeSingle();

  if (!supplier) {
    return NextResponse.json({ error: "This invite is not valid, or has already been used." }, { status: 404 });
  }

  let importerName: string | null = null;
  if (supplier.managed_by_importer_id) {
    const { data: importer } = await (admin.from("importers") as any)
      .select("display_name")
      .eq("id", supplier.managed_by_importer_id)
      .maybeSingle();
    importerName = importer?.display_name ?? null;
  }

  // Count what the importer has already built up on their behalf, so the
  // exporter can see what they are taking ownership of.
  const [{ count: docCount }, { count: productCount }] = await Promise.all([
    (admin.from("documents") as any)
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", supplier.id)
      .is("soft_deleted_at", null),
    (admin.from("products_verify") as any)
      .select("id", { count: "exact", head: true })
      .eq("supplier_id", supplier.id),
  ]);

  return NextResponse.json({
    supplier: {
      id:                supplier.id,
      company_name:      supplier.company_name,
      legal_entity_name: supplier.legal_entity_name,
      country:           supplier.country,
      record_mode:       supplier.record_mode,
      contact_email:     supplier.contact_json?.email ?? null,
    },
    importer_name: importerName,
    documents:     docCount ?? 0,
    products:      productCount ?? 0,
  });
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in to claim a record." }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { token?: string; decline?: boolean };
  const token = body.token?.trim() ?? "";
  const declining = body.decline === true;

  if (!token) return NextResponse.json({ error: "Token required." }, { status: 400 });

  const admin = createAdminSupabaseClient();

  const { data: supplier } = await (admin.from("suppliers") as any)
    .select("id, company_name, record_mode, managed_by_importer_id")
    .eq("claim_invite_token", token)
    .maybeSingle();

  if (!supplier) {
    return NextResponse.json({ error: "This invite is not valid, or has already been used." }, { status: 404 });
  }

  const now = new Date().toISOString();

  // ── Decline ──────────────────────────────────────────────────────────────
  if (declining) {
    await (admin.from("suppliers") as any)
      .update({
        record_mode:        "importer_managed",
        claim_invite_token: null,
        claim_declined_at:  now,
      })
      .eq("id", supplier.id);

    await (admin.from("app_notifications") as any).insert({
      importer_id:       supplier.managed_by_importer_id,
      supplier_id:       supplier.id,
      notification_type: "exporter_claim_declined",
      title:             `${supplier.company_name} declined the record invitation`,
      body:              "You keep full control of this record and remain responsible for uploading and attesting to its evidence.",
      target_url:        "/exporters",
      severity:          "info",
    });

    return NextResponse.json({ ok: true, declined: true });
  }

  // ── Accept ───────────────────────────────────────────────────────────────
  //
  // One RPC, through the USER-scoped client, because both matter.
  //
  // This used to be five sequential writes on the service-role client, and the
  // three that touched profiles all silently did nothing:
  // trg_profiles_prevent_role_escalation is a BEFORE UPDATE trigger, the
  // service-role key bypasses RLS but not triggers, and its only escape hatch
  // resolves auth.uid() — which is NULL for the service key. Every guarded
  // column was reassigned back to its old value with no error raised, so the
  // claim reported success while the account stayed unlinked from the record it
  // had just claimed.
  //
  // claim_exporter_record is SECURITY DEFINER, so the trigger's
  // session_user <> current_user carve-out lets it through, and it needs
  // auth.uid() to identify the claimant — which the service-role client does
  // not carry. Hence the user client. See migration 015.
  const { data: claimedId, error: claimError } = await (supabase as any)
    .rpc("claim_exporter_record", { p_token: token });

  if (claimError) {
    // The function raises with messages written to be shown to a person, and
    // distinguishes "already linked to a record with data" from a bad token.
    const status = claimError.code === "23505" ? 409 : claimError.code === "P0002" ? 404 : 500;
    return NextResponse.json({ error: claimError.message }, { status });
  }

  await (admin.from("app_notifications") as any).insert({
    importer_id:       supplier.managed_by_importer_id,
    supplier_id:       supplier.id,
    notification_type: "exporter_claim_accepted",
    title:             `${supplier.company_name} claimed their record`,
    body:              "They now maintain their own company profile and can upload evidence directly. Your relationship and all existing evidence are unchanged.",
    target_url:        "/exporters",
    severity:          "info",
  });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      supplier.managed_by_importer_id,
    actor_profile_id: user.id,
    actor_role:       "exporter",
    action:           "exporter_record_claimed",
    record_type:      "suppliers",
    record_id:        supplier.id,
    new_value:        { claimed_by: user.email },
  });

  return NextResponse.json({ ok: true, supplier_id: claimedId ?? supplier.id });
}
