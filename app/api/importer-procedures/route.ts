// POST   { kind, action: "generate" | "save" | "adopt", content? }
//
// The importer's own FSVP procedures, as editable versioned records.
//
// Three actions rather than a REST-ish create/update pair, because the
// distinction that matters is not whether a row exists but what state it is in:
// generating rebuilds a draft from live facts, saving keeps a person's edits,
// and adopting turns a draft into the signed record of record. Only the last
// satisfies the obligation.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { refusePreviewWrite } from "@/lib/auth/preview-guard";
import { isActiveOn } from "@/lib/fsvp/qualified-individuals";
import {
  draftApprovedSupplierProcedure,
  draftRecordsProcedure,
  sectionsToText,
  type ProcedureFacts,
} from "@/lib/fsvp/procedure-draft";

export const runtime = "edge";

const KINDS = ["approved_supplier_procedures", "records_procedures"] as const;
type Kind = (typeof KINDS)[number];

const RETENTION_YEARS = 2;

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id, organization_name")
    .eq("id", user.id)
    .maybeSingle();

  const refusal = refusePreviewWrite(profile?.role, "edit FSVP procedures");
  if (refusal) return refusal;

  // Adopting the organization's procedures is the importer's own act. A tenant
  // reviewer signs determinations; they do not speak for the company.
  if (profile?.role !== "us_importer" && profile?.role !== "administrator") {
    return NextResponse.json(
      { error: "Only the importing organization can draft and adopt its own procedures." },
      { status: 403 }
    );
  }

  const importerId: string | null = profile?.importer_id ?? null;
  if (!importerId) {
    return NextResponse.json(
      { error: "Your account is not linked to an importing organization." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({})) as {
    kind?: string;
    action?: string;
    content?: string;
  };

  if (!(KINDS as readonly string[]).includes(body.kind ?? "")) {
    return NextResponse.json({ error: "Unknown procedure." }, { status: 400 });
  }
  const kind = body.kind as Kind;
  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();

  // ── Save an edit ─────────────────────────────────────────────────────────
  if (body.action === "save") {
    const content = (body.content ?? "").trim();
    if (content.length < 40) {
      return NextResponse.json(
        { error: "A procedure needs more than a line. Write what your organization actually does." },
        { status: 400 }
      );
    }

    const { error } = await (admin.from("importer_procedures") as any)
      .update({ content, edited_at: now, updated_at: now })
      .eq("importer_id", importerId)
      .eq("kind", kind)
      .eq("status", "draft");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, saved_at: now });
  }

  // ── Adopt the draft ──────────────────────────────────────────────────────
  if (body.action === "adopt") {
    const { data: draft } = await (admin.from("importer_procedures") as any)
      .select("id, content, version")
      .eq("importer_id", importerId)
      .eq("kind", kind)
      .eq("status", "draft")
      .maybeSingle();

    if (!draft) {
      return NextResponse.json({ error: "There is no draft to adopt." }, { status: 404 });
    }

    // A generated draft carries [REVIEW: …] wherever the platform cannot know
    // the answer. Adopting with those still in place would put an instruction
    // to the reader into the document an investigator reads.
    if (String(draft.content).includes("[REVIEW:")) {
      return NextResponse.json(
        {
          error:
            "This draft still contains passages marked for review. Resolve them first — they mark " +
            "the parts the platform cannot know about your operation, and adopting them unchanged " +
            "would state something that may not be true.",
        },
        { status: 400 }
      );
    }

    // Supersede rather than overwrite: an investigator may ask which procedure
    // was in force when a particular approval was made.
    await (admin.from("importer_procedures") as any)
      .update({ status: "superseded", superseded_at: now, updated_at: now })
      .eq("importer_id", importerId)
      .eq("kind", kind)
      .eq("status", "adopted");

    const { error } = await (admin.from("importer_procedures") as any)
      .update({
        status: "adopted",
        adopted_at: now,
        adopted_by_profile_id: user.id,
        updated_at: now,
      })
      .eq("id", draft.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await (admin.from("audit_logs") as any).insert({
      importer_id:      importerId,
      actor_profile_id: user.id,
      actor_role:       profile.role,
      action:           "importer_procedure_adopted",
      record_type:      "importer_procedures",
      record_id:        draft.id,
      new_value:        { kind, version: draft.version },
    });

    return NextResponse.json({ ok: true, adopted_at: now });
  }

  // ── Generate a fresh draft from live facts ───────────────────────────────
  if (body.action !== "generate") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const [{ data: importer }, { data: qiRows }, { data: recordRows }] = await Promise.all([
    (admin.from("importers") as any)
      .select("legal_name, display_name, duns_number, food_scope")
      .eq("id", importerId)
      .maybeSingle(),
    // The register carries the qualification basis; the name is on the profile
    // it points at, because only someone who can authenticate may sign.
    (admin.from("qualified_individuals") as any)
      .select("qualification_basis, active_from, active_to, profiles(full_name, email)")
      .eq("importer_id", importerId),
    // There is no stored reassessment interval — fsvp_records holds the due
    // DATE. Deriving months from approved_at and reassessment_due_at gives the
    // intervals actually in use rather than a number nobody set.
    (admin.from("fsvp_records") as any)
      .select("approved_at, reassessment_due_at")
      .eq("importer_id", importerId)
      .not("reassessment_due_at", "is", null)
      .not("approved_at", "is", null),
  ]);

  const activeQis = ((qiRows ?? []) as Array<{
    qualification_basis: string | null;
    active_from: string;
    active_to: string | null;
    profiles: { full_name: string | null; email: string } | null;
  }>).filter((q) => isActiveOn(q));

  const months = [...new Set(
    ((recordRows ?? []) as Array<{ approved_at: string; reassessment_due_at: string }>)
      .map((r) => {
        const from = new Date(r.approved_at);
        const to = new Date(r.reassessment_due_at);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
        // Rounded, because a 12-month interval lands 365 or 366 days out and
        // "12 months" is what a person set and would recognise.
        return Math.round((to.getTime() - from.getTime()) / (30.44 * 86_400_000));
      })
      .filter((m): m is number => m !== null && m > 0)
  )].sort((a, b) => a - b);

  const facts: ProcedureFacts = {
    organizationName: importer?.legal_name ?? importer?.display_name ?? profile.organization_name ?? "This organization",
    dunsNumber:       importer?.duns_number ?? null,
    foodScope:        importer?.food_scope ?? "human",
    qualifiedIndividuals: activeQis.map((q) => ({
      name: q.profiles?.full_name || q.profiles?.email || "Unnamed qualified individual",
      basis: q.qualification_basis,
    })),
    reassessmentMonths: months,
    retentionYears: RETENTION_YEARS,
  };

  const sections = kind === "approved_supplier_procedures"
    ? draftApprovedSupplierProcedure(facts)
    : draftRecordsProcedure(facts);

  const content = sectionsToText(sections);

  // Regenerating replaces an untouched draft and refuses to discard edits.
  const { data: existing } = await (admin.from("importer_procedures") as any)
    .select("id, edited_at")
    .eq("importer_id", importerId)
    .eq("kind", kind)
    .eq("status", "draft")
    .maybeSingle();

  if (existing?.edited_at) {
    return NextResponse.json(
      {
        error:
          "This draft has been edited. Regenerating would discard those edits — adopt or clear the " +
          "current draft first.",
      },
      { status: 409 }
    );
  }

  if (existing) {
    const { error } = await (admin.from("importer_procedures") as any)
      .update({ content, generated_at: now, updated_at: now })
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // Version continues the adopted series rather than restarting at 1.
    const { data: latest } = await (admin.from("importer_procedures") as any)
      .select("version")
      .eq("importer_id", importerId)
      .eq("kind", kind)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await (admin.from("importer_procedures") as any).insert({
      importer_id:           importerId,
      kind,
      content,
      version:               (latest?.version ?? 0) + 1,
      status:                "draft",
      generated_at:          now,
      created_by_profile_id: user.id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, content });
}
