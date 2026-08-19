// POST — an importer says no commodity in the taxonomy describes their product.
//
// The alternative this replaces is not "nothing". It is an importer picking the
// nearest wrong commodity, because the dropdown offers no other way forward. A
// determination made against the wrong commodity still arrives with a citation
// and an expiry and reads as authoritative, so the wrong pick is worse than the
// dead end it was working around.
//
// The earlier version queued this for an administrator, which still blocked the
// importer. This version creates a provisional commodity, classifies the product
// to it, and leaves the row marked for cleanup rather than making cleanup a gate.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { pcbCredentialsFromEnv, searchProductsByName } from "@/lib/regulatory/product-code-builder";

export const runtime = "edge";

const PARTS = [
  "fruit", "leaf", "root", "seed", "stem", "flower",
  "whole_plant", "bulb", "tuber", "not_applicable",
] as const;

const CLASSES = [
  "fruit", "vegetable", "nut", "grain", "herb_spice",
  "seafood", "meat_poultry", "dairy", "egg",
  "beverage", "processed_food", "supplement", "other",
] as const;

const PLANT_CLASSES = new Set(["fruit", "vegetable", "nut", "grain", "herb_spice"]);

/** Cap on what we snapshot — evidence of what was looked at, not a data dump. */
const MAX_CANDIDATES = 25;

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "us_importer" || !profile.importer_id) {
    return NextResponse.json(
      { error: "The US importer responsible for the movement raises the classification request." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({})) as {
    product_id?: string;
    described_as?: string;
    commodity_class?: string;
    plant_part?: string;
    is_propagative?: boolean;
    notes?: string;
  };

  const productId = body.product_id?.trim() ?? "";
  const describedAs = body.described_as?.trim() ?? "";
  const commodityClass = (CLASSES as readonly string[]).includes(body.commodity_class ?? "")
    ? body.commodity_class!
    : "";
  if (!productId) return NextResponse.json({ error: "Name the product this is about." }, { status: 400 });
  if (describedAs.length < 2) {
    return NextResponse.json(
      { error: "Describe what the material actually is — that description is the whole request." },
      { status: 400 }
    );
  }
  if (!commodityClass) {
    return NextResponse.json(
      { error: "Choose the broad commodity class so the provisional entry is not plant-only." },
      { status: 400 }
    );
  }

  const isPlantClass = PLANT_CLASSES.has(commodityClass);
  const plantPart = isPlantClass && (PARTS as readonly string[]).includes(body.plant_part ?? "")
    ? body.plant_part!
    : "not_applicable";
  const isPropagative = isPlantClass && body.is_propagative === true;

  const admin = createAdminSupabaseClient();

  const { data: product } = await (admin.from("products_verify") as any)
    .select("id, supplier_id, product_name, commodity_id")
    .eq("id", productId)
    .maybeSingle();

  if (!product) return NextResponse.json({ error: "That product does not exist." }, { status: 404 });
  if (!product.supplier_id) {
    return NextResponse.json({ error: "The product has no supplier relationship to authorize." }, { status: 409 });
  }

  // Same ownership test as /api/products/classify. The admin client bypasses
  // RLS, so tenancy is re-applied by hand here rather than assumed.
  const { data: relationship } = await (admin.from("supplier_relationships") as any)
    .select("id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", profile.importer_id)
    .eq("supplier_id", product.supplier_id)
    .in("status", ["active", "pending_invite"])
    .maybeSingle();

  if (!relationship) {
    return NextResponse.json(
      { error: "That product belongs to a supplier your organization is not linked to." },
      { status: 403 }
    );
  }

  // Search FDA here rather than trusting whatever the browser says FDA said.
  // A snapshot of "what the importer looked at" is only worth keeping if the
  // server is the one that looked. Failure is non-fatal: the request is a
  // description of a real product either way, and losing it because an FDA
  // endpoint was down would be the wrong trade.
  let pcbCandidates: unknown = null;
  const creds = pcbCredentialsFromEnv();
  if (creds) {
    try {
      const rows = await searchProductsByName(describedAs, creds);
      if (rows.length > 0) {
        pcbCandidates = { searched_for: describedAs, searched_at: new Date().toISOString(), rows: rows.slice(0, MAX_CANDIDATES), truncated: rows.length > MAX_CANDIDATES };
      }
    } catch {
      // Deliberately swallowed. The importer is not the right person to hear
      // about our FDA credentials, and the request does not depend on them.
    }
  }

  const { data: liveDeterminations, error: determinationsError } = await (admin.from("admissibility_determinations") as any)
    .select("id, importer_id")
    .eq("product_id", productId)
    .is("superseded_at", null);
  if (determinationsError) {
    return NextResponse.json(
      { error: `Existing determinations could not be checked, so provisional classification was refused. ${determinationsError.message}` },
      { status: 503 }
    );
  }
  const belongsToAnotherImporter = (liveDeterminations ?? []).some(
    (row: { importer_id: string }) => row.importer_id !== profile.importer_id
  );
  if (belongsToAnotherImporter) {
    return NextResponse.json(
      {
        error:
          "Another importer has a live determination for this shared supplier product. " +
          "A platform administrator must resolve the shared product identity first.",
      },
      { status: 409 }
    );
  }

  const { data: existingCommodity } = await (admin.from("commodities") as any)
    .select("id, common_name")
    .ilike("common_name", describedAs)
    .eq("plant_part", plantPart)
    .eq("is_propagative", isPropagative)
    .eq("active", true)
    .maybeSingle();

  let commodity = existingCommodity as { id: string; common_name: string } | null;
  if (!commodity) {
    const basis = `Importer-entered provisional commodity for product ${product.product_name} (${productId}).`;
    const noteParts = [
      body.notes?.trim() || null,
      "Provisional importer-entered commodity pending platform review.",
    ].filter(Boolean);

    const { data: insertedCommodity, error: commodityError } = await (admin.from("commodities") as any)
      .insert({
        common_name:             describedAs,
        scientific_name:         null,
        commodity_class:         commodityClass,
        plant_part:              plantPart,
        is_propagative:          isPropagative,
        notes:                   noteParts.join("\n\n"),
        active:                  true,
        review_status:           "provisional",
        created_by_importer_id:  profile.importer_id,
        created_by_profile_id:   user.id,
        provisional_basis:       basis,
      })
      .select("id, common_name")
      .single();

    if (commodityError) {
      return NextResponse.json({ error: commodityError.message }, { status: 500 });
    }
    commodity = insertedCommodity;
  }
  if (!commodity) {
    return NextResponse.json({ error: "The provisional commodity could not be created." }, { status: 500 });
  }

  const changedAt = new Date().toISOString();
  const { error: updateProductError } = await (admin.from("products_verify") as any)
    .update({ commodity_id: commodity.id })
    .eq("id", productId);
  if (updateProductError) {
    return NextResponse.json({ error: updateProductError.message }, { status: 500 });
  }

  const { error: supersedeError } = await (admin.from("admissibility_determinations") as any)
    .update({ superseded_at: changedAt })
    .eq("product_id", productId)
    .eq("importer_id", profile.importer_id)
    .is("superseded_at", null);

  if (supersedeError) {
    await (admin.from("products_verify") as any)
      .update({ commodity_id: product.commodity_id })
      .eq("id", productId);
    return NextResponse.json(
      { error: `The product could not be classified safely. ${supersedeError.message}` },
      { status: 500 }
    );
  }

  const { data: created, error } = await (admin.from("commodity_classification_requests") as any)
    .insert({
      importer_id:             profile.importer_id,
      product_id:              productId,
      requested_by_profile_id: user.id,
      described_as:            describedAs,
      commodity_class:         commodityClass,
      plant_part:              plantPart,
      is_propagative:          isPropagative,
      notes:                   body.notes?.trim() || null,
      pcb_candidates:          pcbCandidates,
      status:                  "resolved",
      resolved_commodity_id:   commodity.id,
      resolution_note:         "Provisional importer-entered commodity. Platform review recommended.",
      resolved_by_profile_id:  user.id,
      resolved_at:             changedAt,
    })
    .select("id")
    .single();

  if (error) {
    await (admin.from("products_verify") as any)
      .update({ commodity_id: product.commodity_id })
      .eq("id", productId);
    const liveIds = ((liveDeterminations ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (liveIds.length > 0) {
      await (admin.from("admissibility_determinations") as any)
        .update({ superseded_at: null })
        .in("id", liveIds);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      profile.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "commodity_classification_provisional",
    record_type:      "commodity_classification_requests",
    record_id:        created.id,
    previous_value:   { commodity_id: product.commodity_id },
    new_value:        {
      product_id: productId,
      described_as: describedAs,
      commodity_id: commodity.id,
      commodity_name: commodity.common_name,
      commodity_class: commodityClass,
    },
  });

  return NextResponse.json({
    ok: true,
    id: created.id,
    commodity_id: commodity.id,
    commodity_name: commodity.common_name,
    provisional: true,
    pcb_searched: Boolean(pcbCandidates),
  });
}
