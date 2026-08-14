// POST { product_id, lifecycle, discontinued_on?, ever_imported, reason? }
//
// Records whether a food is actually imported.
//
// Not a tidy-up. Marking a product discontinued starts a two-year retention
// clock under 21 CFR 1.510, and marking one never-imported asserts that no FSVP
// obligation ever attached to it — so both are attributable, audited, and
// refused when the assertion contradicts the record.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { refusePreviewWrite } from "@/lib/auth/preview-guard";
import { deniesTenant } from "@/lib/auth/tenancy";
import { planTransition, type ProductLifecycle } from "@/lib/fsvp/product-lifecycle";

export const runtime = "edge";

const LIFECYCLES = ["active", "not_imported", "discontinued"] as const;

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const refusal = refusePreviewWrite(profile?.role, "change what a product's status is");
  if (refusal) return refusal;

  if (!profile || !["us_importer", "administrator"].includes(profile.role)) {
    return NextResponse.json(
      { error: "Only the importing organization can record whether it imports a food." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({})) as {
    product_id?: string;
    lifecycle?: string;
    discontinued_on?: string;
    ever_imported?: boolean;
    reason?: string;
  };

  const productId = body.product_id?.trim();
  if (!productId) return NextResponse.json({ error: "Choose the product." }, { status: 400 });

  if (!(LIFECYCLES as readonly string[]).includes(body.lifecycle ?? "")) {
    return NextResponse.json({ error: "Unknown product state." }, { status: 400 });
  }
  const target = body.lifecycle as ProductLifecycle;

  const admin = createAdminSupabaseClient();

  const { data: product } = await (admin.from("products_verify") as any)
    .select("id, product_name, lifecycle, importer_id, supplier_id")
    .eq("id", productId)
    .maybeSingle();

  if (!product) return NextResponse.json({ error: "That product does not exist." }, { status: 404 });

  if (deniesTenant(profile, product.importer_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Whether the food was ever imported is a fact about the operation that
  // predates this platform, so the caller asserts it. But an FSVP record is
  // evidence to the contrary the platform DOES hold, and it outranks the
  // assertion — a record exists precisely because the food was being imported.
  const { count: recordCount } = await (admin.from("fsvp_records") as any)
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId) as { count: number | null };

  const everImported = Boolean(body.ever_imported) || (recordCount ?? 0) > 0;

  const plan = planTransition({
    from: product.lifecycle as ProductLifecycle,
    to: target,
    discontinuedOn: body.discontinued_on ?? null,
    everImported,
  });

  if (!plan.ok) {
    return NextResponse.json(
      {
        error: plan.reason,
        // Named so the UI can explain why the platform disagreed rather than
        // just refusing.
        has_fsvp_records: (recordCount ?? 0) > 0,
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const { error } = await (admin.from("products_verify") as any)
    .update({
      lifecycle: target,
      discontinued_on: plan.discontinuedOn,
      lifecycle_changed_at: now,
      lifecycle_changed_by_profile_id: user.id,
      lifecycle_reason: body.reason?.trim() || null,
      updated_at: now,
    })
    .eq("id", productId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id:      product.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           "product_lifecycle_changed",
    record_type:      "products_verify",
    record_id:        productId,
    previous_value:   { lifecycle: product.lifecycle },
    new_value:        {
      lifecycle: target,
      discontinued_on: plan.discontinuedOn,
      reason: body.reason?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true, lifecycle: target, discontinued_on: plan.discontinuedOn });
}
