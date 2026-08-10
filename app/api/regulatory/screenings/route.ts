// POST — a qualified individual records that they screened a supplier's
// compliance history, and what they concluded.
//
// 21 CFR 1.505(a)(1)(iv) requires the importer to consider a supplier's
// compliance history when evaluating them, and § 1.505(b) requires that
// evaluation to be performed by a qualified individual. Holding FDA data is not
// the same as having considered it; only the second is a record, and only the
// record is what an inspection asks to see.
//
// Two things are frozen into the screening at the moment it is made: how many
// confirmed findings existed, and how fresh each source was. A screen made
// against six-month-old data is not the same as one made against current data,
// and a later reader must be able to tell them apart without reconstructing
// history.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { refusePreviewWrite } from "@/lib/auth/preview-guard";
import { isActiveOn } from "@/lib/fsvp/qualified-individuals";
import { REGULATORY_SOURCES } from "@/lib/regulatory/sources";
import { notify } from "@/lib/notifications/notify";

export const runtime = "edge";

const CONCLUSIONS = ["no_adverse_history", "adverse_history_accepted", "adverse_history_blocking"] as const;
type Conclusion = (typeof CONCLUSIONS)[number];

/** A screen goes stale. One year matches the § 1.506(d) verification cycle. */
const DEFAULT_VALIDITY_DAYS = 365;

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

  const previewRefusal = refusePreviewWrite(profile.role, "record compliance screenings");
  if (previewRefusal) return previewRefusal;

  const importerId: string = profile.importer_id;
  const admin = createAdminSupabaseClient();

  const body = await req.json().catch(() => ({})) as {
    supplier_id?: string;
    conclusion?: string;
    rationale?: string;
    adverse_findings?: string;
    expires_at?: string;
  };

  const supplierId = body.supplier_id?.trim() ?? "";
  const rationale  = body.rationale?.trim() ?? "";
  const conclusion = CONCLUSIONS.includes(body.conclusion as Conclusion)
    ? (body.conclusion as Conclusion)
    : null;

  if (!supplierId) return NextResponse.json({ error: "Choose the supplier being screened." }, { status: 400 });
  if (!conclusion) {
    return NextResponse.json(
      { error: "Record a conclusion: no adverse history, adverse history accepted, or adverse history blocking." },
      { status: 400 }
    );
  }
  if (!rationale) {
    return NextResponse.json(
      { error: "Record what you reviewed and why you reached this conclusion. A conclusion without reasoning is not a screening." },
      { status: 400 }
    );
  }

  // ── The screener must be an active QI in this tenant ─────────────────────
  const { data: qi } = await (admin.from("qualified_individuals") as any)
    .select("id, active_from, active_to")
    .eq("profile_id", user.id)
    .eq("importer_id", importerId)
    .maybeSingle();

  if (!qi) {
    return NextResponse.json(
      { error: "Only a registered qualified individual can screen a supplier's compliance history — § 1.505(b)." },
      { status: 403 }
    );
  }
  if (!isActiveOn(qi)) {
    return NextResponse.json(
      { error: "Your qualification period has ended. An importer administrator must reinstate you first." },
      { status: 403 }
    );
  }

  // ── The supplier must be ours ────────────────────────────────────────────
  const { data: link } = await (admin.from("supplier_relationships") as any)
    .select("id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", importerId)
    .eq("supplier_id", supplierId)
    .in("status", ["active", "pending_invite"])
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: "That supplier is not linked to your organization." }, { status: 403 });
  }

  // ── Freeze what was true at the moment of screening ──────────────────────
  const [{ data: confirmed }, { data: runs }] = await Promise.all([
    (admin.from("supplier_compliance_history") as any)
      .select("id")
      .eq("importer_id", importerId)
      .eq("supplier_id", supplierId)
      .eq("match_status", "confirmed"),
    (admin.from("regulatory_ingest_runs") as any)
      .select("source, completed_at, window_to")
      .eq("status", "succeeded")
      .order("completed_at", { ascending: false }),
  ]);

  const freshestBySource = new Map<string, { completed_at: string; window_to: string | null }>();
  for (const r of (runs ?? []) as Array<{ source: string; completed_at: string; window_to: string | null }>) {
    if (!freshestBySource.has(r.source)) freshestBySource.set(r.source, r);
  }

  // Every source FDA names for supplier evaluation, each marked with how fresh
  // it was — or that it was not covered at all. Import alerts have no API, so
  // they are always listed as not covered, and the screening says so rather
  // than implying a clean sweep.
  const sourcesJson = REGULATORY_SOURCES.map((s) => {
    const run = freshestBySource.get(s.id);
    return {
      source: s.id,
      label: s.label,
      covered: Boolean(run),
      access: s.access,
      last_refreshed_at: run?.completed_at ?? null,
      data_through: run?.window_to ?? null,
      note: run ? null : s.access === "manual"
        ? "No API exists. Checked by hand, or not checked."
        : "Not configured in this deployment, so not covered by this screening.",
    };
  });

  const confirmedCount = (confirmed ?? []).length;

  // A screening claiming a clean history while confirmed findings sit against
  // the supplier is the one contradiction worth refusing outright.
  if (conclusion === "no_adverse_history" && confirmedCount > 0) {
    return NextResponse.json(
      {
        error:
          `This supplier has ${confirmedCount} confirmed FDA finding${confirmedCount === 1 ? "" : "s"} ` +
          "on record, so the screening cannot conclude there is no adverse history. Choose whether the " +
          "history is accepted or blocking, and say why.",
      },
      { status: 400 }
    );
  }

  const expiresAt = body.expires_at
    || new Date(Date.now() + DEFAULT_VALIDITY_DAYS * 86_400_000).toISOString().slice(0, 10);

  // ── Supersede the previous live screening ────────────────────────────────
  const { data: existing } = await (admin.from("supplier_compliance_screenings") as any)
    .select("id")
    .eq("importer_id", importerId)
    .eq("supplier_id", supplierId)
    .is("superseded_at", null)
    .maybeSingle();

  if (existing) {
    await (admin.from("supplier_compliance_screenings") as any)
      .update({ superseded_at: new Date().toISOString() })
      .eq("id", existing.id);
  }

  const { data: created, error } = await (admin.from("supplier_compliance_screenings") as any)
    .insert({
      importer_id:            importerId,
      supplier_id:            supplierId,
      sources_json:           { sources: sourcesJson },
      confirmed_event_count:  confirmedCount,
      adverse_findings:       body.adverse_findings?.trim() || null,
      conclusion,
      rationale,
      screened_by_profile_id: user.id,
      expires_at:             expiresAt,
    })
    .select("id")
    .single();

  if (error) {
    if (existing) {
      await (admin.from("supplier_compliance_screenings") as any)
        .update({ superseded_at: null })
        .eq("id", existing.id);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      importerId,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           existing ? "compliance_screening_superseded" : "compliance_screening_recorded",
    record_type:      "supplier_compliance_screenings",
    record_id:        created.id,
    previous_value:   existing ? { id: existing.id } : null,
    new_value:        {
      supplier_id: supplierId,
      conclusion,
      confirmed_event_count: confirmedCount,
      expires_at: expiresAt,
    },
  });

  if (conclusion === "adverse_history_blocking") {
    await notify(admin, {
      importerId,
      type:      "compliance_screening_blocking",
      title:     "Compliance screening returned a blocking result",
      body:
        `${profile.full_name ?? profile.email} screened a supplier's FDA compliance history and ` +
        "concluded it blocks approval. Review the supplier's standing.",
      targetUrl: "/compliance-history",
      severity:  "critical",
    });
  }

  return NextResponse.json({
    ok: true,
    id: created.id,
    conclusion,
    confirmed_event_count: confirmedCount,
    expires_at: expiresAt,
    superseded: Boolean(existing),
  });
}
