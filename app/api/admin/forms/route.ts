// POST  { requirement_item_id, rule_version_id, form_key, title, description, schema_json }
// PATCH { id, title?, description?, schema_json? }
// DELETE { id }
//
// Platform-admin authoring of the forms that back a requirement item. Guarded
// exactly like /api/admin/rules/items, including the draft-only rule: a
// published rule version is immutable, and the database enforces it too
// (trg_form_definitions_published_guard) so this check is convenience, not the
// control.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { parseFormSchema } from "@/lib/forms/schema";

export const runtime = "edge";

async function assertAdmin(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await (supabase.from("profiles") as any)
    .select("role").eq("id", user.id).maybeSingle();
  return p?.role === "administrator" ? user : null;
}

async function isDraftVersion(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  versionId: string
) {
  const { data } = await (admin.from("rule_versions") as any)
    .select("status").eq("id", versionId).maybeSingle();
  return data?.status === "draft";
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const user = await assertAdmin(supabase);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const body = await req.json().catch(() => ({}));
  const { requirement_item_id, rule_version_id, form_key, title, description, schema_json, sort_order } = body;

  if (!requirement_item_id || !rule_version_id || !form_key || !title) {
    return NextResponse.json(
      { error: "requirement_item_id, rule_version_id, form_key and title are required." },
      { status: 400 }
    );
  }

  if (!(await isDraftVersion(admin, rule_version_id))) {
    return NextResponse.json(
      { error: "Published rule versions cannot be edited. Clone into a new draft first." },
      { status: 409 }
    );
  }

  const parsed = parseFormSchema(schema_json);
  if (!parsed.ok) {
    return NextResponse.json({ error: "The form definition is not valid.", reasons: parsed.errors }, { status: 400 });
  }

  const { data, error } = await (admin.from("form_definitions") as any)
    .insert({
      requirement_item_id,
      rule_version_id,
      form_key,
      title,
      description: description ?? null,
      schema_json: parsed.schema,
      sort_order: sort_order ?? 0,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That requirement item already has a form, or the form key is already used in this version." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const user = await assertAdmin(supabase);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const body = await req.json().catch(() => ({}));
  const { id, title, description, schema_json, sort_order } = body;

  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const { data: existing } = await (admin.from("form_definitions") as any)
    .select("rule_version_id").eq("id", id).maybeSingle();

  if (!existing) return NextResponse.json({ error: "Form not found." }, { status: 404 });

  if (!(await isDraftVersion(admin, existing.rule_version_id))) {
    return NextResponse.json(
      { error: "Published rule versions cannot be edited. Clone into a new draft first." },
      { status: 409 }
    );
  }

  const update: Record<string, unknown> = {};
  if (title !== undefined)       update.title = title;
  if (description !== undefined) update.description = description || null;
  if (sort_order !== undefined)  update.sort_order = sort_order;

  if (schema_json !== undefined) {
    const parsed = parseFormSchema(schema_json);
    if (!parsed.ok) {
      return NextResponse.json({ error: "The form definition is not valid.", reasons: parsed.errors }, { status: 400 });
    }
    update.schema_json = parsed.schema;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { error } = await (admin.from("form_definitions") as any).update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const user = await assertAdmin(supabase);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });

  const { data: existing } = await (admin.from("form_definitions") as any)
    .select("rule_version_id").eq("id", id).maybeSingle();

  if (!existing) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  if (!(await isDraftVersion(admin, existing.rule_version_id))) {
    return NextResponse.json(
      { error: "Published rule versions cannot be edited. Clone into a new draft first." },
      { status: 409 }
    );
  }

  // Responses reference the definition with ON DELETE RESTRICT, so a form that
  // has been answered cannot be deleted — which is correct: the answers are
  // evidence, and they would become unreadable without the questions.
  const { error } = await (admin.from("form_definitions") as any).delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: "This form has already been answered by a supplier, so it cannot be deleted." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
