// POST  { action: "clone",   version_id }        → new draft version
// POST  { action: "publish", version_id }        → publish a draft
// POST  { action: "archive", version_id }        → archive a published version

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

async function assertAdmin(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.role === "administrator" ? user : null;
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const user = await assertAdmin(supabase);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const body = await req.json();
  const { action, version_id } = body as { action: string; version_id: string };

  if (!action || !version_id) {
    return NextResponse.json({ error: "action and version_id required" }, { status: 400 });
  }

  // ── Clone into new draft ────────────────────────────────────────────────
  if (action === "clone") {
    const { data: source, error: srcErr } = await (admin.from("rule_versions") as any)
      .select("rule_set_id, version_number")
      .eq("id", version_id)
      .maybeSingle();
    if (srcErr || !source) return NextResponse.json({ error: "Source version not found" }, { status: 404 });

    const { data: latest } = await (admin.from("rule_versions") as any)
      .select("version_number")
      .eq("rule_set_id", source.rule_set_id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latest?.version_number ?? 0) + 1;

    const { data: newVersion, error: vErr } = await (admin.from("rule_versions") as any)
      .insert({
        rule_set_id: source.rule_set_id,
        version_number: nextVersion,
        status: "draft",
        cloned_from_version_id: version_id,
        notes: `Cloned from version ${source.version_number}`,
        created_by_profile_id: user.id,
      })
      .select("id")
      .single();
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

    // Clone sections
    const { data: sourceSections } = await (admin.from("requirement_sections") as any)
      .select("*")
      .eq("rule_version_id", version_id);

    const sectionIdMap: Record<string, string> = {};
    for (const sec of sourceSections ?? []) {
      const { data: newSec } = await (admin.from("requirement_sections") as any)
        .insert({
          rule_version_id: newVersion.id,
          section_key: sec.section_key,
          section_name: sec.section_name,
          applies_to: sec.applies_to,
          description: sec.description,
          sort_order: sec.sort_order,
        })
        .select("id")
        .single();
      if (newSec) sectionIdMap[sec.id] = newSec.id;
    }

    // Clone weights
    const { data: sourceWeights } = await (admin.from("scoring_category_weights") as any)
      .select("*")
      .eq("rule_version_id", version_id);
    for (const w of sourceWeights ?? []) {
      const newSectionId = sectionIdMap[w.section_id];
      if (!newSectionId) continue;
      await (admin.from("scoring_category_weights") as any).insert({
        rule_version_id: newVersion.id,
        section_id: newSectionId,
        weight_percent: w.weight_percent,
      });
    }

    // Clone requirement items
    for (const [oldSectionId, newSectionId] of Object.entries(sectionIdMap)) {
      const { data: items } = await (admin.from("requirement_items") as any)
        .select("*")
        .eq("section_id", oldSectionId);
      for (const item of items ?? []) {
        await (admin.from("requirement_items") as any).insert({
          section_id: newSectionId,
          item_key: item.item_key,
          item_name: item.item_name,
          description: item.description,
          evidence_type: item.evidence_type,
          is_required: item.is_required,
          is_critical_blocker: item.is_critical_blocker,
          auto_accept: item.auto_accept,
          expiration_applies: item.expiration_applies,
          cfr_citation: item.cfr_citation,
          sort_order: item.sort_order,
        });
      }
    }

    // Clone approval thresholds
    const { data: sourceThresholds } = await (admin.from("approval_thresholds") as any)
      .select("*")
      .eq("rule_version_id", version_id);
    for (const t of sourceThresholds ?? []) {
      await (admin.from("approval_thresholds") as any).insert({
        rule_version_id: newVersion.id,
        label: t.label,
        min_score: t.min_score,
        max_score: t.max_score,
        resulting_status: t.resulting_status,
      });
    }

    await (admin.from("audit_logs") as any).insert({
      actor_profile_id: user.id,
      actor_role: "administrator",
      action: "rule_version_cloned",
      record_type: "rule_versions",
      record_id: newVersion.id,
      new_value: { cloned_from: version_id, new_version: nextVersion },
    });

    return NextResponse.json({ version_id: newVersion.id });
  }

  // ── Publish draft ───────────────────────────────────────────────────────
  if (action === "publish") {
    const { data: ver } = await (admin.from("rule_versions") as any)
      .select("status, rule_set_id")
      .eq("id", version_id)
      .maybeSingle();
    if (!ver) return NextResponse.json({ error: "Version not found" }, { status: 404 });
    if (ver.status !== "draft") return NextResponse.json({ error: "Only drafts can be published" }, { status: 400 });

    // Validate weights sum to 100% per applies_to
    const { data: weights } = await (admin.from("scoring_category_weights") as any)
      .select("weight_percent, requirement_sections!inner(applies_to)")
      .eq("rule_version_id", version_id);

    const totals: Record<string, number> = {};
    for (const w of weights ?? []) {
      const at = (w.requirement_sections as { applies_to: string }).applies_to;
      totals[at] = (totals[at] ?? 0) + Number(w.weight_percent);
    }
    for (const [appliesTo, total] of Object.entries(totals)) {
      if (Math.abs(total - 100) > 0.1) {
        return NextResponse.json(
          { error: `${appliesTo} section weights total ${total.toFixed(1)}% — must equal 100% before publishing.` },
          { status: 400 }
        );
      }
    }

    await (admin.from("rule_versions") as any)
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", version_id);

    await (admin.from("audit_logs") as any).insert({
      actor_profile_id: user.id,
      actor_role: "administrator",
      action: "rule_version_published",
      record_type: "rule_versions",
      record_id: version_id,
    });

    return NextResponse.json({ success: true });
  }

  // ── Archive ─────────────────────────────────────────────────────────────
  if (action === "archive") {
    await (admin.from("rule_versions") as any)
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .eq("id", version_id);

    await (admin.from("audit_logs") as any).insert({
      actor_profile_id: user.id,
      actor_role: "administrator",
      action: "rule_version_archived",
      record_type: "rule_versions",
      record_id: version_id,
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
