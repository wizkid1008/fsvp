// POST { profile_id, legal_name?, display_name?, ein?, duns_number?, food_scope?,
//        address_json?, attach_to_importer_id? }
//
// Approves a pending us_importer account and gives it an organization.
//
// This is where importer tenancy is established. Accounts deliberately receive
// no importer_id at signup — the old auto_link_importer trigger assigned every
// importer the first importers row on the platform, which collapsed every
// tenant into one. An administrator now creates (or picks) the organization
// explicitly, and only at approval time, so an unapproved account cannot squat
// a tenant.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

const FOOD_SCOPES = new Set(["human", "animal", "both"]);

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: actor } = await (supabase.from("profiles") as any)
    .select("role, user_status")
    .eq("id", user.id)
    .maybeSingle();

  if (actor?.role !== "administrator" || actor?.user_status !== "active") {
    return NextResponse.json({ error: "Administrators only." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    profile_id?: string;
    legal_name?: string;
    display_name?: string;
    ein?: string;
    duns_number?: string;
    food_scope?: string;
    address_json?: Record<string, unknown>;
    attach_to_importer_id?: string;
  };

  const profileId = body.profile_id?.trim();
  if (!profileId) {
    return NextResponse.json({ error: "profile_id is required." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: target } = await (admin.from("profiles") as any)
    .select("id, email, role, importer_id, organization_name, country, user_status")
    .eq("id", profileId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }
  if (target.role !== "us_importer") {
    return NextResponse.json(
      { error: "Only us_importer accounts get an importer organization." },
      { status: 400 }
    );
  }
  if (target.importer_id) {
    return NextResponse.json(
      { error: "This account already belongs to an organization." },
      { status: 409 }
    );
  }

  let importerId: string;

  if (body.attach_to_importer_id) {
    // Adding a colleague to an organization that already exists.
    const { data: existing } = await (admin.from("importers") as any)
      .select("id")
      .eq("id", body.attach_to_importer_id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    importerId = existing.id;
  } else {
    const legalName = body.legal_name?.trim() || target.organization_name?.trim();
    if (!legalName) {
      return NextResponse.json(
        { error: "legal_name is required when creating a new organization." },
        { status: 400 }
      );
    }

    const foodScope = FOOD_SCOPES.has(body.food_scope ?? "") ? body.food_scope! : "human";

    const addressJson =
      body.address_json && typeof body.address_json === "object"
        ? body.address_json
        : target.country
          ? { country: target.country }
          : {};

    // USER-scoped client, not `admin` — see the profiles update below for why.
    // importers_tenant_write permits is_platform_admin(), so an administrator
    // can insert here through RLS.
    const { data: created, error: createError } = await (supabase.from("importers") as any)
      .insert({
        legal_name:            legalName,
        display_name:          body.display_name?.trim() || legalName,
        ein:                   body.ein?.trim() || null,
        duns_number:           body.duns_number?.trim() || null,
        food_scope:            foodScope,
        address_json:          addressJson,
        primary_contact_email: target.email,
      })
      .select("id")
      .single();

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }
    importerId = created.id;
  }

  // This MUST use the user-scoped client, and the reason is not obvious.
  //
  // The service-role key bypasses RLS. It does NOT bypass triggers, and
  // trg_profiles_prevent_role_escalation is a BEFORE UPDATE trigger on
  // profiles. Its escape hatch is is_platform_admin(), which resolves
  // auth.uid() — and under the service-role client there is no JWT, so
  // auth.uid() is NULL, the check returns false, and the trigger silently
  // reverts user_status and importer_id to their old values. No error is
  // raised. The update "succeeds", this route returned 200, the admin UI
  // closed its modal, and the account stayed pending forever. Approval had
  // never worked.
  //
  // Through the user-scoped client auth.uid() is the administrator's id,
  // is_platform_admin() is true, and the trigger lets the write through —
  // which is exactly the case it was written to allow. profiles_self_update
  // permits is_platform_admin() too, so RLS is satisfied.
  const { data: linked, error: linkError } = await (supabase.from("profiles") as any)
    .update({ importer_id: importerId, user_status: "active" })
    .eq("id", profileId)
    .select("id, importer_id, user_status")
    .maybeSingle();

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  // Read back rather than trust a silent success. A trigger that rewrites the
  // row returns no error, so "no error" is not evidence the write landed —
  // that silence is what hid this bug.
  if (!linked || linked.importer_id !== importerId || linked.user_status !== "active") {
    return NextResponse.json(
      {
        error:
          "The account could not be activated — the update was accepted but did not persist. " +
          "This usually means the acting administrator's own profile is not active.",
      },
      { status: 500 }
    );
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      importerId,
    actor_profile_id: user.id,
    actor_role:       "administrator",
    action:           body.attach_to_importer_id ? "importer_account_attached" : "importer_account_approved",
    record_type:      "profiles",
    record_id:        profileId,
    new_value:        { importer_id: importerId, email: target.email },
  });

  return NextResponse.json({ ok: true, importer_id: importerId });
}
