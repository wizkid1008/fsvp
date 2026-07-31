// PATCH — edit a qualified individual's credentials, or retire them by setting
// active_to.
//
// Retiring does not invalidate anything they already signed. An attestation is
// a dated snapshot of what was true when it was made, and rewriting history to
// say an expired QI never signed would misrepresent the record. What retiring
// does is stop them signing anything new — enforced in the database by
// enforce_qi_signer(), not just here.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isQualificationBasis, toList } from "@/lib/fsvp/qualified-individuals";

export const runtime = "edge";

export async function PATCH(
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
    return NextResponse.json({ error: "Only importers can maintain the qualified individual register." }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const { id } = params;

  const { data: qi } = await (admin.from("qualified_individuals") as any)
    .select("id, importer_id, active_to")
    .eq("id", id)
    .maybeSingle();

  if (!qi) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (qi.importer_id !== profile.importer_id && profile.role !== "administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    qualification_basis?: string;
    education?: string;
    training?: string;
    experience?: string;
    languages?: string[] | string;
    scope?: string[] | string;
    credentials_document_id?: string | null;
    active_from?: string;
    active_to?: string | null;
  };

  const update: Record<string, unknown> = {};

  if (body.qualification_basis !== undefined) {
    if (!isQualificationBasis(body.qualification_basis)) {
      return NextResponse.json(
        { error: "Qualification basis must be education, training, experience or combination." },
        { status: 400 }
      );
    }
    update.qualification_basis = body.qualification_basis;
  }

  if (body.education !== undefined)  update.education  = body.education?.trim() || null;
  if (body.training !== undefined)   update.training   = body.training?.trim() || null;
  if (body.experience !== undefined) update.experience = body.experience?.trim() || null;
  if (body.languages !== undefined)  update.languages  = toList(body.languages);
  if (body.scope !== undefined)      update.scope      = toList(body.scope);
  if (body.credentials_document_id !== undefined) {
    update.credentials_document_id = body.credentials_document_id || null;
  }
  if (body.active_from !== undefined) update.active_from = body.active_from;
  if (body.active_to !== undefined)   update.active_to   = body.active_to || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { error } = await (admin.from("qualified_individuals") as any)
    .update(update)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const retired = body.active_to !== undefined && body.active_to && !qi.active_to;

  await (admin.from("audit_logs") as any).insert({
    importer_id:      qi.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           retired ? "qi_deactivated" : "qi_updated",
    record_type:      "qualified_individuals",
    record_id:        id,
    new_value:        update,
  });

  return NextResponse.json({ ok: true });
}
