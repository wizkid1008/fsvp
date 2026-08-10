// POST — a qualified individual signs one or more sections of an FSVP record.
//
// § 1.503 names three determinations a QI must perform or oversee, and § 1.510(a)(2)
// requires the record to be signed and dated. One submit can cover all three,
// because in practice one person does all three at once — but each is stored as
// its own row so the ledger says which determination was attested to, and so a
// later edit to one narrative invalidates only that signature.
//
// Each row snapshots the exact text signed plus its SHA-256. The approve route
// re-hashes the live narrative and refuses to approve on a mismatch: a signature
// against text that has since been edited covers nothing, and would otherwise
// read as coverage in an FDA records request.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/notify";
import {
  ATTESTATION_LABEL,
  DEFAULT_ATTESTATION_STATEMENT,
  REQUIRED_ATTESTATION_TYPES,
  hashAttestationContent,
  type RequiredAttestationType,
} from "@/lib/fsvp/qi-attestation";
import { isActiveOn } from "@/lib/fsvp/qualified-individuals";

export const runtime = "edge";

const NARRATIVE_COLUMN: Record<RequiredAttestationType, string> = {
  hazard_analysis:            "hazard_analysis_notes",
  supplier_evaluation:        "supplier_evaluation_notes",
  verification_determination: "verification_determination",
};

export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => ({})) as {
    fsvp_record_id?: string;
    types?: string[];
    statement?: string;
  };

  const recordId = body.fsvp_record_id?.trim() ?? "";
  const types = (body.types ?? []).filter((t): t is RequiredAttestationType =>
    (REQUIRED_ATTESTATION_TYPES as readonly string[]).includes(t)
  );

  if (!recordId) return NextResponse.json({ error: "fsvp_record_id is required." }, { status: 400 });
  if (types.length === 0) {
    return NextResponse.json({ error: "Choose at least one determination to sign." }, { status: 400 });
  }

  // The signer must be on the register and active today. enforce_qi_signer()
  // repeats both checks in the database, so this cannot be bypassed by calling
  // the API directly — it exists here to return a usable message.
  const { data: qi } = await (admin.from("qualified_individuals") as any)
    .select("id, importer_id, active_from, active_to")
    .eq("profile_id", user.id)
    .eq("importer_id", profile.importer_id)
    .maybeSingle();

  if (!qi) {
    return NextResponse.json(
      { error: "You are not on this organization's qualified individual register, so you cannot sign FSVP determinations." },
      { status: 403 }
    );
  }
  if (!isActiveOn(qi)) {
    return NextResponse.json(
      { error: "Your qualification period has ended. An importer administrator must reinstate you before you can sign." },
      { status: 403 }
    );
  }

  const { data: record } = await (admin.from("fsvp_records") as any)
    .select("id, importer_id, supplier_id, hazard_analysis_notes, supplier_evaluation_notes, verification_determination")
    .eq("id", recordId)
    .maybeSingle();

  if (!record) return NextResponse.json({ error: "FSVP record not found." }, { status: 404 });
  if (record.importer_id !== profile.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const statement = body.statement?.trim() || DEFAULT_ATTESTATION_STATEMENT;

  const rows: Array<Record<string, unknown>> = [];
  const signedLabels: string[] = [];

  for (const type of types) {
    const narrative = record[NARRATIVE_COLUMN[type]] as string | null;
    if (!narrative || narrative.trim() === "") {
      return NextResponse.json(
        { error: `${ATTESTATION_LABEL[type]} has not been documented yet — there is nothing to sign.` },
        { status: 400 }
      );
    }

    rows.push({
      importer_id:             record.importer_id,
      qualified_individual_id: qi.id,
      fsvp_record_id:          recordId,
      attestation_type:        type,
      statement,
      content_snapshot:        narrative,
      content_hash:            await hashAttestationContent(narrative),
      signed_by_profile_id:    user.id,
    });
    signedLabels.push(ATTESTATION_LABEL[type]);
  }

  const { error } = await (admin.from("qi_attestations") as any).insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      record.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "qi_attestation_signed",
    record_type:      "fsvp_records",
    record_id:        recordId,
    new_value:        { types, statement, signed_by: profile.full_name ?? profile.email },
  });

  await notify(admin, {
    importerId: record.importer_id,
    type:       "qi_attestation_signed",
    title:      "FSVP determination signed",
    body:       `${profile.full_name ?? profile.email} signed: ${signedLabels.join(", ")}.`,
    targetUrl:  `/fsvp-records/${recordId}`,
    severity:   "info",
  });

  return NextResponse.json({ ok: true, signed: types.length });
}
