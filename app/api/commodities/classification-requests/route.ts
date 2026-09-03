// POST — an importer says no commodity in the taxonomy describes their product.
//
// The alternative this replaces is not "nothing". It is an importer picking the
// nearest wrong commodity, because the dropdown offers no other way forward. A
// determination made against the wrong commodity still arrives with a citation
// and an expiry and reads as authoritative, so the wrong pick is worse than the
// dead end it was working around.
//
// The product stays blocked on `not_classified` while the request is open. That
// is intentional: the alternative is letting every free-text suggestion become
// a live commodity, which makes the reference layer unmanageable and risky.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { pcbCredentialsFromEnv, searchProductsByName } from "@/lib/regulatory/product-code-builder";

export const runtime = "edge";

// Kept identical in order and contents to the lists in /api/commodities —
// these two validators accept the same vocabulary, and a value that passes one
// but not the other would let a request be filed that can never be resolved.
const PARTS = [
  "all_including_seed", "bulb", "flower", "fruit", "leaf", "pod",
  "root", "seed", "stem", "tuber", "whole_plant", "not_applicable",
] as const;

const CLASSES = [
  "beverage", "dairy", "egg", "fruit", "grain", "herb_spice",
  "meat_poultry", "nut", "processed_food", "seafood", "supplement",
  "vegetable", "other",
] as const;

const PLANT_CLASSES = new Set(["fruit", "grain", "herb_spice", "nut", "vegetable"]);

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
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        {
          error:
            "A classification request for this product is already open. Adding a second would " +
            "queue the same question twice — add to the existing one instead.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id:      profile.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "commodity_classification_requested",
    record_type:      "commodity_classification_requests",
    record_id:        created.id,
    new_value:        { product_id: productId, described_as: describedAs, commodity_class: commodityClass },
  });

  return NextResponse.json({
    ok: true,
    id: created.id,
    pcb_searched: Boolean(pcbCandidates),
  });
}
