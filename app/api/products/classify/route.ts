// POST — link an importer-visible product to the global commodity taxonomy.
//
// Classification changes the question an admissibility determination answers.
// Existing live determinations are therefore superseded rather than silently
// carried across to a different commodity.

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

  if (profile?.role !== "us_importer" || !profile.importer_id) {
    return NextResponse.json(
      { error: "The US importer responsible for the movement must classify this product." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({})) as {
    product_id?: string;
    commodity_id?: string;
  };
  const productId = body.product_id?.trim() ?? "";
  const commodityId = body.commodity_id?.trim() ?? "";
  if (!productId || !commodityId) {
    return NextResponse.json({ error: "Choose both a product and a commodity." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const [{ data: product }, { data: commodity }] = await Promise.all([
    (admin.from("products_verify") as any)
      .select("id, supplier_id, product_name, commodity_id")
      .eq("id", productId)
      .maybeSingle(),
    (admin.from("commodities") as any)
      .select("id, common_name, active")
      .eq("id", commodityId)
      .eq("active", true)
      .maybeSingle(),
  ]);

  if (!product) return NextResponse.json({ error: "That product does not exist." }, { status: 404 });
  if (!commodity) return NextResponse.json({ error: "That commodity is not active in the taxonomy." }, { status: 404 });
  if (!product.supplier_id) {
    return NextResponse.json({ error: "The product has no supplier relationship to authorize." }, { status: 409 });
  }

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

  if (product.commodity_id === commodityId) {
    return NextResponse.json({ ok: true, unchanged: true, commodity_name: commodity.common_name });
  }

  const { data: liveDeterminations, error: determinationsError } = await (admin.from("admissibility_determinations") as any)
    .select("id, importer_id")
    .eq("product_id", productId)
    .is("superseded_at", null);
  if (determinationsError) {
    return NextResponse.json(
      { error: `Existing determinations could not be checked, so reclassification was refused. ${determinationsError.message}` },
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
          "Reclassification would invalidate their record, so a platform administrator must " +
          "resolve the shared product identity first.",
      },
      { status: 409 }
    );
  }

  const changedAt = new Date().toISOString();
  const { error: updateError } = await (admin.from("products_verify") as any)
    .update({ commodity_id: commodityId })
    .eq("id", productId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { error: supersedeError } = await (admin.from("admissibility_determinations") as any)
    .update({ superseded_at: changedAt })
    .eq("product_id", productId)
    .eq("importer_id", profile.importer_id)
    .is("superseded_at", null);

  if (supersedeError) {
    // Preserve the old classification if the dependent snapshots could not be
    // invalidated. A new commodity with an old determination is worse than no
    // classification change at all.
    await (admin.from("products_verify") as any)
      .update({ commodity_id: product.commodity_id })
      .eq("id", productId);
    return NextResponse.json(
      { error: `The product could not be reclassified safely. ${supersedeError.message}` },
      { status: 500 }
    );
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id: profile.importer_id,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: "product_classified",
    record_type: "products_verify",
    record_id: productId,
    previous_value: { commodity_id: product.commodity_id },
    new_value: { commodity_id: commodityId, commodity_name: commodity.common_name },
  });

  return NextResponse.json({
    ok: true,
    commodity_name: commodity.common_name,
    determinations_superseded: Boolean(product.commodity_id),
  });
}
