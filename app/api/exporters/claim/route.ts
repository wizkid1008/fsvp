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
      target_url:        "/suppliers",
      severity:          "info",
    });

    return NextResponse.json({ ok: true, declined: true });
  }

  // ── Accept ───────────────────────────────────────────────────────────────
  const { data: profile } = await (admin.from("profiles") as any)
    .select("id, supplier_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  // Signing up through the invite fires trg_auto_link_supplier_profile, which
  // creates a fresh suppliers row and points the profile at it. That row is a
  // duplicate of the record being claimed, so discard it — but only if nothing
  // has been attached to it, otherwise we would silently destroy real data.
  if (profile.supplier_id && profile.supplier_id !== supplier.id) {
    const strayId = profile.supplier_id;

    const [{ count: strayDocs }, { count: strayProducts }, { count: strayFacilities }, { count: strayLinks }] =
      await Promise.all([
        (admin.from("documents") as any).select("id", { count: "exact", head: true }).eq("supplier_id", strayId),
        (admin.from("products_verify") as any).select("id", { count: "exact", head: true }).eq("supplier_id", strayId),
        (admin.from("facilities_verify") as any).select("id", { count: "exact", head: true }).eq("supplier_id", strayId),
        (admin.from("supplier_relationships") as any).select("id", { count: "exact", head: true }).eq("supplier_id", strayId),
      ]);

    const strayIsEmpty =
      (strayDocs ?? 0) === 0 && (strayProducts ?? 0) === 0 &&
      (strayFacilities ?? 0) === 0 && (strayLinks ?? 0) === 0;

    if (!strayIsEmpty) {
      return NextResponse.json(
        {
          error:
            "Your account is already linked to a different company record that has data attached. " +
            "Contact an administrator to merge the two rather than losing anything.",
        },
        { status: 409 }
      );
    }

    await (admin.from("profiles") as any).update({ supplier_id: null }).eq("id", user.id);
    await (admin.from("suppliers") as any).delete().eq("id", strayId);
  }

  // Transfer ownership. managed_by_importer_id must be cleared in the same
  // statement — suppliers_managed_by_check requires it to be null when the
  // record is self_managed.
  const { error: claimError } = await (admin.from("suppliers") as any)
    .update({
      record_mode:            "self_managed",
      managed_by_importer_id: null,
      claim_invite_token:     null,
      claimed_at:             now,
      claim_declined_at:      null,
    })
    .eq("id", supplier.id);

  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });

  await (admin.from("profiles") as any)
    .update({ supplier_id: supplier.id, role: "exporter", user_status: "active" })
    .eq("id", user.id);

  await (admin.from("app_notifications") as any).insert({
    importer_id:       supplier.managed_by_importer_id,
    supplier_id:       supplier.id,
    notification_type: "exporter_claim_accepted",
    title:             `${supplier.company_name} claimed their record`,
    body:              "They now maintain their own company profile and can upload evidence directly. Your relationship and all existing evidence are unchanged.",
    target_url:        "/suppliers",
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

  return NextResponse.json({ ok: true, supplier_id: supplier.id });
}
