// POST — save a form draft, or submit it as evidence.
//
// On submit the answers are rendered to HTML and stored as an ordinary
// `documents` row carrying the requirement_item_id. That is the whole trick:
// scoring (lib/scoring/engine.ts), the review queue, the bestStatus ranking,
// expiry and the FDA inspection package are all keyed on documents, so a
// completed form satisfies a requirement by exactly the same path an uploaded
// PDF does, and none of them needed changing.
//
// The structured answers stay in form_responses for querying and future rule
// logic, and each submission is a new version — the same keep-the-record-and-a-
// snapshot shape as the QI attestation ledger.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { DOCUMENT_BUCKET } from "@/lib/constants";
import { resolveProvenance } from "@/lib/evidence/provenance";
import { parseFormSchema, validateAnswers, type FormAnswers } from "@/lib/forms/schema";
import { renderFormResponseHtml } from "@/lib/forms/render";
import { notify } from "@/lib/notifications/notify";

export const runtime = "edge";

/** Form keys whose answers also keep suppliers.contact_json current. */
const CONTACT_FORM_KEYS = new Set(["supplier_primary_contact", "supplier_regulatory_contact"]);

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, supplier_id, importer_id, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminSupabaseClient();

  const body = await req.json().catch(() => ({})) as {
    form_definition_id?: string;
    supplier_id?: string;
    answers?: FormAnswers;
    submit?: boolean;
  };

  const definitionId = body.form_definition_id?.trim() ?? "";
  const answers = (body.answers ?? {}) as FormAnswers;
  const isSubmit = body.submit === true;

  if (!definitionId) {
    return NextResponse.json({ error: "form_definition_id is required." }, { status: 400 });
  }

  const { data: definition } = await (admin.from("form_definitions") as any)
    .select("id, form_key, title, description, schema_json, requirement_item_id")
    .eq("id", definitionId)
    .maybeSingle();

  if (!definition) return NextResponse.json({ error: "Form not found." }, { status: 404 });

  // ── Who is this for, and may the caller act for them? ────────────────────
  const callerSupplierId: string | null = profile.supplier_id ?? null;
  let supplierId = body.supplier_id?.trim() || callerSupplierId || "";

  if (!supplierId) {
    return NextResponse.json({ error: "supplier_id is required." }, { status: 400 });
  }

  if (callerSupplierId) {
    // A supplier or exporter may only answer for themselves, whatever they send.
    supplierId = callerSupplierId;
  } else if (profile.importer_id) {
    // Importer side: only for a supplier they are actually linked to. This is
    // the managed-exporter case — the exporter has no account, so the importer
    // fills the questionnaire in on their behalf and the provenance says so.
    const { data: link } = await (admin.from("supplier_relationships") as any)
      .select("supplier_id")
      .eq("relationship_type", "importer_supplier")
      .eq("importer_id", profile.importer_id)
      .eq("supplier_id", supplierId)
      .in("status", ["active", "pending_invite"])
      .maybeSingle();

    if (!link) {
      return NextResponse.json(
        { error: "That supplier is not linked to your organization." },
        { status: 403 }
      );
    }
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Resolve the importer whose queue this belongs in ─────────────────────
  // Same derivation as /api/documents/upload: a supplier profile has no
  // importer_id of its own, so take it from the single active relationship. With
  // several, leave it null and let the review queue resolve by relationship.
  let importerId: string | null = profile.importer_id ?? null;
  if (!importerId) {
    const { data: links } = await (admin.from("supplier_relationships") as any)
      .select("importer_id")
      .eq("relationship_type", "importer_supplier")
      .eq("supplier_id", supplierId)
      .in("status", ["active", "pending_invite"]);

    const ids = [...new Set(
      ((links ?? []) as Array<{ importer_id: string | null }>).map((l) => l.importer_id).filter(Boolean)
    )] as string[];
    if (ids.length === 1) importerId = ids[0];
  }

  // ── Validate ─────────────────────────────────────────────────────────────
  const parsed = parseFormSchema(definition.schema_json);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "This form is misconfigured and cannot be completed. An administrator needs to fix it.", reasons: parsed.errors },
      { status: 500 }
    );
  }

  if (isSubmit) {
    const check = validateAnswers(parsed.schema, answers);
    if (!check.ok) {
      return NextResponse.json({ error: "Some answers are missing or invalid.", reasons: check.errors }, { status: 400 });
    }
  }

  // ── Find or create the working row ───────────────────────────────────────
  const { data: existingDraft } = await (admin.from("form_responses") as any)
    .select("id, version")
    .eq("form_definition_id", definitionId)
    .eq("supplier_id", supplierId)
    .eq("status", "draft")
    .maybeSingle();

  let responseId: string;
  let version: number;

  if (existingDraft) {
    responseId = existingDraft.id;
    version = existingDraft.version;
    const { error } = await (admin.from("form_responses") as any)
      .update({ answers_json: answers, importer_id: importerId })
      .eq("id", responseId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: latest } = await (admin.from("form_responses") as any)
      .select("version")
      .eq("form_definition_id", definitionId)
      .eq("supplier_id", supplierId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    version = (latest?.version ?? 0) + 1;

    const { data: created, error } = await (admin.from("form_responses") as any)
      .insert({
        form_definition_id:  definitionId,
        supplier_id:         supplierId,
        importer_id:         importerId,
        requirement_item_id: definition.requirement_item_id,
        version,
        answers_json:        answers,
        status:              "draft",
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    responseId = created.id;
  }

  if (!isSubmit) {
    return NextResponse.json({ ok: true, id: responseId, version, status: "draft" });
  }

  // ── Submit: render, store, and register it as evidence ───────────────────
  const provenance = resolveProvenance({
    uploaderSupplierId: callerSupplierId,
    targetSupplierId:   supplierId,
    uploaderProfileId:  user.id,
  });

  const { data: supplier } = await (admin.from("suppliers") as any)
    .select("company_name, contact_json")
    .eq("id", supplierId)
    .maybeSingle();

  const submittedAt = new Date();
  const submitterName = profile.full_name ?? profile.email ?? "Unknown";

  const html = renderFormResponseHtml(parsed.schema, answers, {
    supplierName:    supplier?.company_name ?? "Supplier",
    formTitle:       definition.title,
    formDescription: definition.description,
    version,
    submittedByName: submitterName,
    submittedAt:     submittedAt.toLocaleDateString(),
    evidenceSource:  provenance.evidence_source,
  });

  const bytes = new TextEncoder().encode(html);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const fileName = `${definition.form_key}-v${version}.html`;
  const storagePath = `${importerId ?? supplierId}/${supplierId}/${Date.now()}-${fileName}`;

  // Uploaded with the admin client rather than the caller's. These bytes are
  // generated server-side after validation, not user-supplied, and the storage
  // policy keys on the first path segment being the caller's own tenant — which
  // an exporter whose importer_id was derived above does not satisfy.
  const upload = await admin.storage.from(DOCUMENT_BUCKET).upload(storagePath, bytes, {
    contentType: "text/html; charset=utf-8",
    upsert: false,
  });

  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
  }

  const { data: document, error: docError } = await (admin.from("documents") as any)
    .insert({
      importer_id:            importerId,
      supplier_id:            supplierId,
      document_kind:          definition.title,
      title:                  `${definition.title} (v${version})`,
      description:            "Completed in the app. Answers are also stored structurally on the form response.",
      storage_path:           storagePath,
      original_filename:      fileName,
      mime_type:              "text/html",
      size_bytes:             bytes.byteLength,
      sha256,
      linked_entity_type:     "supplier",
      linked_entity_id:       supplierId,
      requirement_item_id:    definition.requirement_item_id,
      evidence_source:        provenance.evidence_source,
      attested_by_name:       provenance.attested_by_name,
      attested_at:            provenance.attested_at,
      evidence_status:        provenance.evidence_status,
      reviewer_profile_id:    provenance.reviewer_profile_id,
      uploaded_by_profile_id: user.id,
      uploaded_via:           "app",
    })
    .select("id")
    .single();

  if (docError) {
    // Do not leave an orphaned object behind if the row could not be written.
    await admin.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: docError.message }, { status: 500 });
  }

  const { error: finalizeError } = await (admin.from("form_responses") as any)
    .update({
      status:                  "submitted",
      answers_json:            answers,
      document_id:             document.id,
      submitted_by_profile_id: user.id,
      submitted_at:            submittedAt.toISOString(),
      importer_id:             importerId,
    })
    .eq("id", responseId);

  if (finalizeError) return NextResponse.json({ error: finalizeError.message }, { status: 500 });

  // The contact forms keep suppliers.contact_json current, because the suppliers
  // list, the exporter create route and the FSVP record page all still read it.
  if (CONTACT_FORM_KEYS.has(definition.form_key)) {
    const merged = { ...(supplier?.contact_json ?? {}) } as Record<string, unknown>;
    for (const [key, value] of Object.entries(answers)) {
      if (value !== null && value !== undefined && value !== "") merged[key] = value;
    }
    await (admin.from("suppliers") as any).update({ contact_json: merged }).eq("id", supplierId);
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      importerId,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "form_response_submitted",
    record_type:      "form_responses",
    record_id:        responseId,
    new_value:        { form_key: definition.form_key, version, document_id: document.id },
  });

  // Only when the supplier submitted it — an importer filling it in for a
  // managed exporter is not news to themselves, and the row is already accepted.
  if (provenance.evidence_source === "supplier_attested") {
    await notify(admin, {
      importerId,
      supplierId,
      type:      "form_response_submitted",
      title:     `${definition.title} submitted`,
      body:      `${supplier?.company_name ?? "A supplier"} completed the ${definition.title}. It is waiting in your review queue.`,
      targetUrl: "/importer-review",
      severity:  "info",
    });
  }

  return NextResponse.json({ ok: true, id: responseId, version, status: "submitted", document_id: document.id });
}
