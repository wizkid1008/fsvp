// POST — invite an outside FSVP consultant, give them a tenant-scoped login,
// and put them on the register in one step.
//
// The login is a `reviewer` profile carrying this importer's importer_id.
// 004_reviewer_tenancy.sql splits that role in two: a reviewer WITHOUT an
// importer_id is a platform-wide compliance reviewer (unchanged), while a
// reviewer WITH one is confined to that tenant by the ordinary
// current_importer_ids() branch every policy already had. They can read the
// tenant, author hazard analyses and verification records, and sign
// attestations — but current_importer_ids_write() excludes them from approving
// records, editing suppliers or managing the organization.
//
// Modeled on /api/admin/invite-user, which already does inviteUserByEmail +
// profile upsert correctly; this is the tenant-scoped version of it.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isQualificationBasis, toList } from "@/lib/fsvp/qualified-individuals";

export const runtime = "edge";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["us_importer", "administrator"].includes(profile.role)) {
    return NextResponse.json({ error: "Only importers can invite a qualified individual." }, { status: 403 });
  }
  if (!profile.importer_id) {
    return NextResponse.json(
      { error: "Your account is not linked to an importer organization yet. An administrator must approve it first." },
      { status: 400 }
    );
  }

  const importerId: string = profile.importer_id;
  const admin = createAdminSupabaseClient();

  const body = await req.json().catch(() => ({})) as {
    email?: string;
    full_name?: string;
    qualification_basis?: string;
    education?: string;
    training?: string;
    experience?: string;
    languages?: string[] | string;
    scope?: string[] | string;
    active_from?: string;
    active_to?: string;
  };

  const email    = body.email?.trim().toLowerCase() ?? "";
  const fullName = body.full_name?.trim() ?? "";
  const basis    = body.qualification_basis?.trim() ?? "";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ error: "Enter the person's name." }, { status: 400 });
  }
  if (!isQualificationBasis(basis)) {
    return NextResponse.json(
      { error: "Qualification basis must be education, training, experience or combination." },
      { status: 400 }
    );
  }

  const supportingText = [body.education, body.training, body.experience]
    .map((v) => v?.trim() ?? "")
    .join("");
  if (!supportingText) {
    return NextResponse.json(
      { error: "Record the education, training or experience that qualifies this person." },
      { status: 400 }
    );
  }

  // An email that already has an account elsewhere on the platform cannot be
  // pulled into this tenant — doing so would move an exporter's or another
  // importer's user across a tenancy boundary. Say so plainly instead.
  const { data: existing } = await (admin.from("profiles") as any)
    .select("id, importer_id, role")
    .ilike("email", email)
    .maybeSingle();

  let profileId: string;

  if (existing) {
    if (existing.importer_id !== importerId) {
      return NextResponse.json(
        {
          error:
            "That email already has an account on the platform that belongs to another organization. " +
            "Ask them to use a different address, or contact an administrator.",
        },
        { status: 409 }
      );
    }
    // Already one of ours — no invite needed, just register them below.
    profileId = existing.id;
  } else {
    const redirectTo = new URL("/auth/callback?next=/verified", req.url).toString();

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        // handle_new_user() only honours 'supplier' and 'us_importer' from
        // signup metadata, so the real role is set by the upsert below.
        role: "reviewer",
      },
      redirectTo,
    });

    if (inviteError || !invited?.user?.id) {
      return NextResponse.json(
        { error: inviteError?.message ?? "Could not send the invitation." },
        { status: 400 }
      );
    }

    profileId = invited.user.id;

    // user_status 'active' because the importer is vouching for them and the
    // access is confined to that importer's own tenant. There is nothing for a
    // platform administrator to adjudicate here.
    const { error: profileError } = await (admin.from("profiles") as any).upsert(
      {
        id:          profileId,
        email,
        full_name:   fullName,
        role:        "reviewer",
        importer_id: importerId,
        user_status: "active",
      },
      { onConflict: "id" }
    );

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
  }

  const { data: created, error } = await (admin.from("qualified_individuals") as any)
    .insert({
      importer_id:           importerId,
      profile_id:            profileId,
      qualification_basis:   basis,
      education:             body.education?.trim() || null,
      training:              body.training?.trim() || null,
      experience:            body.experience?.trim() || null,
      languages:             toList(body.languages),
      scope:                 toList(body.scope),
      active_from:           body.active_from || undefined,
      active_to:             body.active_to || null,
      created_by_profile_id: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That person is already on your qualified individual register." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      importerId,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "qi_registered",
    record_type:      "qualified_individuals",
    record_id:        created.id,
    new_value:        { profile_id: profileId, name: fullName, email, qualification_basis: basis, invited: !existing },
  });

  return NextResponse.json({ ok: true, id: created.id, invite_sent: !existing });
}
