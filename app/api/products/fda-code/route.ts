// POST — record the FDA product code for a product as packed, and verify it.
//
// This is the writer for the columns migration 024 added to products_verify.
// It is the only direction that carries a warrant: the code comes from the
// importer's broker or their ACE entry, and FDA's Product Code Builder is asked
// whether it is real. Nothing here derives a code from a commodity name, for
// the reason spelled out at the top of lib/regulatory/product-code-builder.ts —
// subclass is the container and PIC is the process, and the taxonomy knows
// neither.
//
// Three ways this refuses, all of them on purpose:
//
//   * a code that cannot be parsed at all
//   * a six-character code whose middle element could be subclass or PIC, until
//     the caller says which
//   * a code that contradicts the commodity it is being filed against
//
// The third is the interesting one. Industry and class come from an
// administrator maintaining the taxonomy; the full code comes from an importer.
// When they disagree, one of them is about a different product, and storing it
// anyway would bury that.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  decomposeProductCode,
  pcbCredentialsFromEnv,
  reconcileWithCommodity,
  verifyProductCode,
  PcbError,
  type ProductCodeParts,
} from "@/lib/regulatory/product-code-builder";

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
      { error: "The US importer filing the entry records the product code." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({})) as {
    product_id?: string;
    fda_product_code?: string;
    /** Only needed to disambiguate a six-character code. */
    subclass?: string;
    pic?: string;
  };

  const productId = body.product_id?.trim() ?? "";
  const rawCode = body.fda_product_code?.trim().toUpperCase() ?? "";
  if (!productId) return NextResponse.json({ error: "Name the product." }, { status: 400 });
  if (!rawCode) return NextResponse.json({ error: "Give a product code." }, { status: 400 });

  // ── Parse before touching the database ──────────────────────────────────
  const decomposed = decomposeProductCode(rawCode);
  if (decomposed.status === "unparseable") {
    return NextResponse.json({ error: decomposed.reason }, { status: 400 });
  }

  let parts: ProductCodeParts;
  if (decomposed.status === "parsed") {
    parts = decomposed.parts;
  } else {
    const subclass = body.subclass?.trim().toUpperCase() || null;
    const pic = body.pic?.trim().toUpperCase() || null;
    const middle = rawCode.slice(3, rawCode.length - 2);

    if (!subclass && !pic) {
      return NextResponse.json(
        { error: decomposed.reason, candidates: decomposed.candidates },
        { status: 409 }
      );
    }
    if ((subclass && subclass !== middle) || (pic && pic !== middle)) {
      return NextResponse.json(
        { error: `The code's middle character is ${middle}; that is the only value it can carry.` },
        { status: 400 }
      );
    }
    parts = {
      industry: rawCode.slice(0, 2),
      class: rawCode[2],
      subclass,
      pic,
      product: rawCode.slice(-2),
    };
  }

  const admin = createAdminSupabaseClient();

  const { data: product } = await (admin.from("products_verify") as any)
    .select("id, supplier_id, product_name, commodity_id, fda_product_code")
    .eq("id", productId)
    .maybeSingle();

  if (!product) return NextResponse.json({ error: "That product does not exist." }, { status: 404 });
  if (!product.supplier_id) {
    return NextResponse.json({ error: "The product has no supplier relationship to authorize." }, { status: 409 });
  }

  // The admin client bypasses RLS, so tenancy is re-applied by hand.
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

  // ── Does the code agree with what the product is classified as? ─────────
  if (product.commodity_id) {
    const { data: commodity } = await (admin.from("commodities") as any)
      .select("common_name, fda_industry_code, fda_class_code, fda_product_group")
      .eq("id", product.commodity_id)
      .maybeSingle();

    if (commodity) {
      const mismatches = reconcileWithCommodity(parts, {
        industry: commodity.fda_industry_code,
        class: commodity.fda_class_code,
        group: commodity.fda_product_group,
      });
      if (mismatches.length > 0) {
        return NextResponse.json(
          {
            error:
              `${rawCode} does not agree with this product's classification ` +
              `(${commodity.common_name}). Resolve the disagreement before recording it — ` +
              `one of the two is about a different product.`,
            reasons: mismatches,
          },
          { status: 409 }
        );
      }
    }
  }

  // ── Ask FDA whether the code is real ────────────────────────────────────
  // Unavailable verification is not the same as failed verification. Without
  // credentials the code is still recorded, with verified_at left null — which
  // is the schema saying "nobody has checked this", not "this is fine".
  let verifiedAt: string | null = null;
  let verificationNote: string;

  const creds = pcbCredentialsFromEnv();
  if (!creds) {
    verificationNote =
      "Recorded, but not checked against FDA — the Product Code Builder integration is not configured.";
  } else {
    try {
      const verdict = await verifyProductCode(rawCode, creds);
      if (verdict.status === "invalid") {
        return NextResponse.json(
          { error: `FDA does not recognise ${rawCode} as a product code. Check it against the entry.` },
          { status: 400 }
        );
      }
      if (verdict.status === "bad_length") {
        return NextResponse.json(
          { error: `FDA rejected ${rawCode} as the wrong length for a product code.` },
          { status: 400 }
        );
      }
      verifiedAt = new Date().toISOString();
      verificationNote = "Verified against FDA's Product Code Builder.";
    } catch (err) {
      // Our credential problem, not the importer's data problem. Recording the
      // code unverified is honest; refusing it would blame the wrong party.
      verificationNote = err instanceof PcbError
        ? "Recorded, but FDA could not be reached to check it."
        : "Recorded, but the verification step failed.";
    }
  }

  const { error: updateError } = await (admin.from("products_verify") as any)
    .update({
      fda_product_code:             rawCode,
      fda_subclass_code:            parts.subclass,
      fda_pic_code:                 parts.pic,
      fda_product_code_verified_at: verifiedAt,
    })
    .eq("id", productId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      profile.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "product_fda_code_recorded",
    record_type:      "products_verify",
    record_id:        productId,
    previous_value:   { fda_product_code: product.fda_product_code },
    new_value:        { fda_product_code: rawCode, verified_at: verifiedAt },
  });

  return NextResponse.json({
    ok: true,
    fda_product_code: rawCode,
    parts,
    verified_at: verifiedAt,
    note: verificationNote,
  });
}
