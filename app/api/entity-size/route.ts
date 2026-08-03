// POST — record the importer's three-year average, which is what a very small
// importer claim under § 1.512 actually rests on.
//
// § 1.500 defines a very small importer by average annual sales of human food
// (plus the market value of food acquired without sale) over the previous three
// years. Without this on file, "very small importer" is an assertion; with it,
// it is a determination someone can check.
//
// Written by the importer, not the qualified individual: it is the
// organization's own commercial figure. The QI relies on it when they sign the
// applicability determination.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  // Deliberately not reviewers: a qualified individual relies on this figure,
  // so they should not also be the one setting it.
  if (!profile || !["us_importer", "administrator"].includes(profile.role)) {
    return NextResponse.json(
      { error: "Only an importer administrator can record the organization's size determination." },
      { status: 403 }
    );
  }
  if (!profile.importer_id) {
    return NextResponse.json({ error: "Your account is not linked to an importer organization." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as {
    food_scope?: string;
    three_year_average?: number | string;
    currency?: string;
    basis_notes?: string;
    determined_at?: string;
    expires_at?: string;
  };

  const foodScope = body.food_scope === "animal" ? "animal" : "human";
  const average = Number(body.three_year_average);

  if (!Number.isFinite(average) || average < 0) {
    return NextResponse.json(
      { error: "Enter the three-year average as a number." },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();

  const { data: created, error } = await (admin.from("entity_size_determinations") as any)
    .insert({
      importer_id:           profile.importer_id,
      category:              "very_small_importer",
      food_scope:            foodScope,
      three_year_average:    average,
      currency:              body.currency?.trim() || "USD",
      basis_notes:           body.basis_notes?.trim() || null,
      determined_at:         body.determined_at || undefined,
      expires_at:            body.expires_at || null,
      created_by_profile_id: user.id,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      profile.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "entity_size_determined",
    record_type:      "entity_size_determinations",
    record_id:        created.id,
    new_value:        { food_scope: foodScope, three_year_average: average, currency: body.currency ?? "USD" },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
