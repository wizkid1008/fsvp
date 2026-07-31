// POST — register an existing tenant user as an FSVP qualified individual.
//
// § 1.503 requires the hazard analysis, supplier evaluation and verification
// determination to be performed or overseen by a qualified individual, and
// § 1.510(b) requires those records to be signed. This is the register that
// makes "qualified" a fact on the record rather than an assumption.
//
// profile_id is mandatory: only someone who can authenticate can sign. To bring
// in an outside consultant who has no account yet, use ./invite, which creates
// the login and the register entry together.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isQualificationBasis, toList } from "@/lib/fsvp/qualified-individuals";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  // Deliberately not reviewers: the importer maintains the register, so a
  // qualified individual cannot enrol themselves or widen their own scope.
  if (!profile || !["us_importer", "administrator"].includes(profile.role)) {
    return NextResponse.json({ error: "Only importers can maintain the qualified individual register." }, { status: 403 });
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
    profile_id?: string;
    qualification_basis?: string;
    education?: string;
    training?: string;
    experience?: string;
    languages?: string[] | string;
    scope?: string[] | string;
    credentials_document_id?: string;
    active_from?: string;
    active_to?: string;
  };

  const profileId = body.profile_id?.trim() ?? "";
  const basis     = body.qualification_basis?.trim() ?? "";

  if (!profileId) {
    return NextResponse.json({ error: "Choose the person to register." }, { status: 400 });
  }
  if (!isQualificationBasis(basis)) {
    return NextResponse.json(
      { error: "Qualification basis must be education, training, experience or combination." },
      { status: 400 }
    );
  }

  // § 1.500 defines a qualified individual partly by what qualifies them, so an
  // empty register entry would defeat the purpose — require the narrative that
  // matches the stated basis.
  const supportingText = [body.education, body.training, body.experience]
    .map((v) => v?.trim() ?? "")
    .join("");
  if (!supportingText) {
    return NextResponse.json(
      { error: "Record the education, training or experience that qualifies this person." },
      { status: 400 }
    );
  }

  // The person must already belong to this tenant. Read through the admin
  // client because profiles RLS only exposes the caller's own row.
  const { data: target } = await (admin.from("profiles") as any)
    .select("id, importer_id, full_name, email, role")
    .eq("id", profileId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "That person does not have an account." }, { status: 404 });
  }
  if (target.importer_id !== importerId) {
    return NextResponse.json(
      { error: "That person is not a member of your organization." },
      { status: 403 }
    );
  }

  const { data: created, error } = await (admin.from("qualified_individuals") as any)
    .insert({
      importer_id:             importerId,
      profile_id:              profileId,
      qualification_basis:     basis,
      education:               body.education?.trim() || null,
      training:                body.training?.trim() || null,
      experience:              body.experience?.trim() || null,
      languages:               toList(body.languages),
      scope:                   toList(body.scope),
      credentials_document_id: body.credentials_document_id || null,
      active_from:             body.active_from || undefined,
      active_to:               body.active_to || null,
      created_by_profile_id:   user.id,
    })
    .select("id")
    .single();

  if (error) {
    // unique (importer_id, profile_id)
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
    new_value:        {
      profile_id: profileId,
      name: target.full_name ?? target.email,
      qualification_basis: basis,
      active_from: body.active_from ?? null,
      active_to: body.active_to ?? null,
    },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
