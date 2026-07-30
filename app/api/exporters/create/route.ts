// POST — an importer creates an exporter record themselves.
//
// Exists because plenty of real exporters will never register on the platform,
// while the importer still carries the full FSVP obligation under 21 CFR 1.502.
// The record is marked `importer_managed`, meaning the importer is responsible
// for uploading and attesting to its evidence — see documents.evidence_source.
//
// Modeled on /api/supplier-links/invite, which already does find-or-create +
// link + optional invite correctly for the exporter→upstream-supplier case.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

// validate_exporter_link() rejects any importer_supplier link whose target is
// not export-eligible, so these are the only types allowed here.
const EXPORT_ELIGIBLE = new Set(["exporter", "exporter_manufacturer", "trader"]);

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
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
    return NextResponse.json({ error: "Only importers can create exporter records." }, { status: 403 });
  }
  if (!profile.importer_id) {
    return NextResponse.json(
      { error: "Your account is not linked to an importer organization yet. An administrator must approve it first." },
      { status: 400 }
    );
  }

  const importerId: string = profile.importer_id;

  const body = await req.json().catch(() => ({})) as {
    company_name?: string;
    legal_entity_name?: string;
    country?: string;
    supplier_type?: string;
    fda_registration_number?: string;
    duns_number?: string;
    website?: string;
    contact_name?: string;
    contact_email?: string;
    notes?: string;
  };

  const companyName  = body.company_name?.trim() ?? "";
  const country      = body.country?.trim() ?? "";
  const contactEmail = body.contact_email?.trim().toLowerCase() ?? "";
  const contactName  = body.contact_name?.trim() ?? "";
  const supplierType = EXPORT_ELIGIBLE.has(body.supplier_type ?? "") ? body.supplier_type! : "exporter";

  if (!companyName) return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  if (!country)     return NextResponse.json({ error: "Country is required." }, { status: 400 });
  if (contactEmail && !isValidEmail(contactEmail)) {
    return NextResponse.json({ error: "Enter a valid contact email address." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // ── Duplicate detection on (name, country) ───────────────────────────────
  const { data: dupes } = await (admin.from("suppliers") as any)
    .select("id, company_name, record_mode, managed_by_importer_id")
    .ilike("company_name", companyName)
    .eq("country", country);

  type Dupe = { id: string; company_name: string; record_mode: string; managed_by_importer_id: string | null };
  const matches = (dupes ?? []) as Dupe[];

  // Already registered and owned by the exporter themselves — the importer
  // should link to it, not create a shadow copy.
  const selfManaged = matches.find((m) => m.record_mode === "self_managed");
  if (selfManaged) {
    const { data: alreadyLinked } = await (admin.from("supplier_relationships") as any)
      .select("id")
      .eq("relationship_type", "importer_supplier")
      .eq("importer_id", importerId)
      .eq("supplier_id", selfManaged.id)
      .maybeSingle();

    return NextResponse.json(
      {
        error: alreadyLinked
          ? `${selfManaged.company_name} is already registered and linked to your account.`
          : `${selfManaged.company_name} is already registered on the platform. Link to them instead of creating a duplicate.`,
        existing_supplier_id: selfManaged.id,
        action: alreadyLinked ? "already_linked" : "link_instead",
      },
      { status: 409 }
    );
  }

  // This importer already manages a record for this company.
  const ownManaged = matches.find((m) => m.managed_by_importer_id === importerId);
  if (ownManaged) {
    return NextResponse.json(
      {
        error: `You already manage a record for ${ownManaged.company_name} in ${country}.`,
        existing_supplier_id: ownManaged.id,
        action: "already_exists",
      },
      { status: 409 }
    );
  }

  // A different importer manages a record for the same company. That is fine —
  // each importer keeps their own private record. Merging them would leak data
  // across tenants.

  // ── Create ───────────────────────────────────────────────────────────────
  const token = contactEmail ? generateToken() : null;

  const { data: created, error: createError } = await (admin.from("suppliers") as any)
    .insert({
      company_name:            companyName,
      legal_entity_name:       body.legal_entity_name?.trim() || companyName,
      country,
      supplier_type:           supplierType,
      website:                 normalizeWebsite(body.website ?? ""),
      fda_registration_number: body.fda_registration_number?.trim() || null,
      duns_number:             body.duns_number?.trim() || null,
      contact_json:            contactName || contactEmail
        ? { name: contactName || null, email: contactEmail || null }
        : {},
      address_json:            {},
      approval_status:         "pending_review",
      certification_status:    "pending_review",
      record_mode:             token ? "claim_pending" : "importer_managed",
      managed_by_importer_id:  importerId,
      claim_invite_token:      token,
      claim_invite_sent_at:    token ? new Date().toISOString() : null,
      created_by_profile_id:   user.id,
    })
    .select("id, company_name, record_mode")
    .single();

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  // ── Link to the importer ─────────────────────────────────────────────────
  // Status is 'active' immediately even when a claim invite is outstanding: the
  // importer's FSVP obligation does not wait on whether the exporter ever logs
  // in. Only record ownership is pending.
  const { error: linkError } = await (admin.from("supplier_relationships") as any)
    .insert({
      relationship_type:    "importer_supplier",
      importer_id:          importerId,
      supplier_id:          created.id,
      status:               "active",
      invite_email:         contactEmail || null,
      linked_by_profile_id: user.id,
      notes:                body.notes?.trim() || null,
    });

  if (linkError) {
    // Roll back the orphan rather than leave an unreachable record behind.
    await (admin.from("suppliers") as any).delete().eq("id", created.id);
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  // ── Optional claim invite ────────────────────────────────────────────────
  let inviteSent = false;
  if (contactEmail && token) {
    try {
      const claimUrl = new URL(`/claim-exporter?token=${token}`, req.url).toString();

      const { data: existingProfile } = await (admin.from("profiles") as any)
        .select("id")
        .ilike("email", contactEmail)
        .maybeSingle();

      if (!existingProfile) {
        await admin.auth.admin.inviteUserByEmail(contactEmail, {
          data: {
            full_name:         contactName || undefined,
            organization_name: companyName,
            role:              "supplier",
          },
          redirectTo: claimUrl,
        });
      }
      // If they already have an account, the claim link still works — they just
      // do not need the signup email.
      inviteSent = true;
    } catch {
      // Non-fatal: the record and link exist, and the invite can be resent.
    }
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      importerId,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "exporter_record_created",
    record_type:      "suppliers",
    record_id:        created.id,
    new_value:        {
      company_name: companyName,
      country,
      supplier_type: supplierType,
      record_mode: created.record_mode,
      invited: !!contactEmail,
    },
  });

  return NextResponse.json({
    ok: true,
    supplier_id: created.id,
    record_mode: created.record_mode,
    invite_sent: inviteSent,
  });
}
