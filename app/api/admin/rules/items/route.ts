// POST   { section_id, item_key, item_name, ... }   → create item
// PATCH  { id, ...fields }                           → update item
// DELETE { id }                                      → delete item

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

async function assertAdmin(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await (supabase.from("profiles") as any)
    .select("role").eq("id", user.id).maybeSingle();
  return p?.role === "administrator" ? user : null;
}

async function isDraftSection(admin: ReturnType<typeof createAdminSupabaseClient>, sectionId: string) {
  const { data } = await (admin.from("requirement_sections") as any)
    .select("rule_version_id, rule_versions!inner(status)")
    .eq("id", sectionId)
    .maybeSingle();
  return (data?.rule_versions as { status: string } | null)?.status === "draft";
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const user = await assertAdmin(supabase);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const body = await req.json();
  const { section_id, item_key, item_name, description, evidence_type,
          is_required, is_critical_blocker, auto_accept, expiration_applies,
          cfr_citation, sort_order } = body;

  if (!section_id || !item_key || !item_name) {
    return NextResponse.json({ error: "section_id, item_key, and item_name are required" }, { status: 400 });
  }
  if (!(await isDraftSection(admin, section_id))) {
    return NextResponse.json({ error: "Cannot add items to a published version. Clone first." }, { status: 400 });
  }

  const { data, error } = await (admin.from("requirement_items") as any)
    .insert({ section_id, item_key, item_name, description, evidence_type,
              is_required: is_required ?? true, is_critical_blocker: is_critical_blocker ?? false,
              auto_accept: auto_accept ?? false, expiration_applies: expiration_applies ?? false,
              cfr_citation, sort_order: sort_order ?? 0 })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const user = await assertAdmin(supabase);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const body = await req.json();
  const { id, section_id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: item } = await (admin.from("requirement_items") as any)
    .select("section_id").eq("id", id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  if (!(await isDraftSection(admin, item.section_id))) {
    return NextResponse.json({ error: "Cannot edit items in a published version. Clone first." }, { status: 400 });
  }

  const allowedFields = ["item_name", "description", "evidence_type", "is_required",
    "is_critical_blocker", "auto_accept", "expiration_applies", "cfr_citation", "sort_order"];
  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in fields) updates[key] = fields[key];
  }

  const { error } = await (admin.from("requirement_items") as any)
    .update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const user = await assertAdmin(supabase);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: item } = await (admin.from("requirement_items") as any)
    .select("section_id").eq("id", id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  if (!(await isDraftSection(admin, item.section_id))) {
    return NextResponse.json({ error: "Cannot delete items from a published version. Clone first." }, { status: 400 });
  }

  const { error } = await (admin.from("requirement_items") as any).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
