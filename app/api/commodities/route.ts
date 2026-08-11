// POST — add a commodity to the taxonomy.
//
// A commodity is a fact about the world rather than about any one importer, so
// this is global reference data maintained by a platform administrator.
//
// The identity of a commodity for admissibility purposes is not just its name.
// The same species entering as a different plant part, or as propagative
// material rather than food, is a DIFFERENT regulatory question — APHIS rules
// for mango fruit and mango plants have almost nothing in common. The unique
// index in migration 012 reflects that, and so does the duplicate message here.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { refusePreviewWrite } from "@/lib/auth/preview-guard";

export const runtime = "edge";

const CLASSES = [
  "fruit", "vegetable", "nut", "grain", "herb_spice",
  "seafood", "meat_poultry", "dairy", "egg",
  "beverage", "processed_food", "supplement", "other",
] as const;

const PARTS = [
  "fruit", "leaf", "root", "seed", "stem", "flower",
  "whole_plant", "bulb", "tuber", "not_applicable",
] as const;

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "administrator") {
    return NextResponse.json(
      { error: "Only a platform administrator can maintain the commodity taxonomy." },
      { status: 403 }
    );
  }

  const refusal = refusePreviewWrite(profile.role, "maintain the commodity taxonomy");
  if (refusal) return refusal;

  const admin = createAdminSupabaseClient();

  const body = await req.json().catch(() => ({})) as {
    common_name?: string;
    scientific_name?: string;
    commodity_class?: string;
    plant_part?: string;
    is_propagative?: boolean;
    fda_product_code?: string;
    notes?: string;
  };

  const commonName = body.common_name?.trim() ?? "";
  if (commonName.length < 2) {
    return NextResponse.json({ error: "Give the commodity a common name." }, { status: 400 });
  }

  if (!(CLASSES as readonly string[]).includes(body.commodity_class ?? "")) {
    return NextResponse.json(
      { error: "Choose a commodity class — it routes agency jurisdiction later." },
      { status: 400 }
    );
  }

  const plantPart = (PARTS as readonly string[]).includes(body.plant_part ?? "")
    ? body.plant_part! : null;

  const { data: created, error } = await (admin.from("commodities") as any)
    .insert({
      common_name:      commonName,
      scientific_name:  body.scientific_name?.trim() || null,
      commodity_class:  body.commodity_class,
      plant_part:       plantPart,
      is_propagative:   body.is_propagative === true,
      fda_product_code: body.fda_product_code?.trim() || null,
      notes:            body.notes?.trim() || null,
    })
    .select("id, common_name")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        {
          error:
            `"${commonName}" already exists with that plant part and propagative status. If this is ` +
            `a different part of the same species, or the propagative form, say so — it is a ` +
            `different commodity for admissibility purposes and needs its own entry.`,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      null,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "commodity_created",
    record_type:      "commodities",
    record_id:        created.id,
    new_value:        {
      common_name: commonName,
      commodity_class: body.commodity_class,
      plant_part: plantPart,
      is_propagative: body.is_propagative === true,
    },
  });

  return NextResponse.json({ ok: true, id: created.id, common_name: created.common_name });
}
