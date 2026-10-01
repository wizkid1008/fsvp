// GET  → list corrective actions (or suppliers if ?list_suppliers=1)
// POST → create a new corrective action

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isTenantConfined } from "@/lib/auth/tenancy";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { ownOrUnclaimedProducts } from "@/lib/products/ownership";

export const runtime = "edge";

const ALLOWED_ROLES = new Set(["us_importer", "reviewer", "administrator"]);

/**
 * The importer a request acts for. An administrator's own profile has no
 * importer_id; previewing an importer, it is that importer — without this the
 * supplier list came back empty and a new action failed the NOT NULL on
 * corrective_actions.importer_id.
 */
function actingImporterId(profile: { role: string; importer_id: string | null }): string | null {
  return profile.role === "administrator"
    ? resolvePreviewedAccountId("administrator", null)
    : profile.importer_id;
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id, supplier_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const listSuppliers = req.nextUrl.searchParams.get("list_suppliers") === "1";

  if (listSuppliers) {
    // Suppliers linked to this importer, each with its products, for the new
    // action form: an action can be about one product, or the whole exporter.
    if (!ALLOWED_ROLES.has(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const importerId = actingImporterId(profile);
    if (!importerId) return NextResponse.json({ suppliers: [] });

    const admin = createAdminSupabaseClient();
    const { data: links, error: linkErr } = await (admin.from("supplier_relationships") as any)
      .select("supplier_id")
      .eq("relationship_type", "importer_supplier")
      .eq("importer_id", importerId)
      .in("status", ["active", "pending_invite"]);
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

    const ids = ((links ?? []) as Array<{ supplier_id: string | null }>)
      .map((l) => l.supplier_id)
      .filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ suppliers: [] });

    const [{ data: rows, error: rowErr }, { data: productRows }] = await Promise.all([
      (admin.from("suppliers") as any).select("id, company_name").in("id", ids).order("company_name"),
      // The admin client bypasses RLS: products are this importer's own or
      // unclaimed — another buyer's product records are not offered.
      (admin.from("products_verify") as any)
        .select("id, product_name, supplier_id")
        .in("supplier_id", ids)
        .or(ownOrUnclaimedProducts(importerId))
        .eq("lifecycle", "active")
        .order("product_name"),
    ]);
    if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });

    const products = (productRows ?? []) as Array<{ id: string; product_name: string; supplier_id: string }>;
    const suppliers = ((rows ?? []) as Array<{ id: string; company_name: string }>).map((s) => ({
      id: s.id,
      supplier_name: s.company_name,
      products: products.filter((p) => p.supplier_id === s.id).map((p) => ({ id: p.id, product_name: p.product_name })),
    }));
    return NextResponse.json({ suppliers });
  }

  // List corrective actions. This selected food_id, a column dropped with the
  // legacy `foods` table, so the query errored and always returned nothing.
  let query = (supabase.from("corrective_actions") as any)
    .select("id, issue_description, triggered_by, status, triggered_at, closed_at, supplier_id, product_id, investigation_summary, action_taken, decision")
    .order("triggered_at", { ascending: false });

  // Anyone holding an importer_id sees only their own tenant. Only a platform
  // administrator or a platform reviewer (no importer_id) sees across tenants.
  if (isTenantConfined(profile)) {
    query = query.eq("importer_id", profile.importer_id);
  }

  const { data: actions } = await query;
  return NextResponse.json({ actions: actions ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.has(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { supplier_id, issue_description, triggered_by, product_id } = body as {
    supplier_id: string;
    issue_description: string;
    triggered_by: string;
    product_id?: string | null;
  };

  if (!supplier_id || !issue_description || !triggered_by) {
    return NextResponse.json({ error: "supplier_id, issue_description, and triggered_by are required" }, { status: 400 });
  }

  const validTriggers = ["verification_finding", "recall", "consumer_complaint", "inspector_finding", "reassessment", "other"];
  if (!validTriggers.includes(triggered_by)) {
    return NextResponse.json({ error: "Invalid triggered_by value" }, { status: 400 });
  }

  const importerId = actingImporterId(profile);
  if (!importerId) {
    return NextResponse.json(
      {
        error: profile.role === "administrator"
          ? "Preview an importer to record a corrective action for it."
          : "Your account is not linked to an importer organization.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();

  // The admin client bypasses RLS, so tenancy is checked here: the exporter
  // must be linked to this importer, and a named product must be that
  // exporter's and visible to this importer.
  const { data: link } = await (admin.from("supplier_relationships") as any)
    .select("id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", importerId)
    .eq("supplier_id", supplier_id)
    .in("status", ["active", "pending_invite"])
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "That exporter is not linked to this importer." }, { status: 403 });

  if (product_id) {
    const { data: product } = await (admin.from("products_verify") as any)
      .select("id")
      .eq("id", product_id)
      .eq("supplier_id", supplier_id)
      .or(ownOrUnclaimedProducts(importerId))
      .maybeSingle();
    if (!product) return NextResponse.json({ error: "That product is not one of this exporter's." }, { status: 400 });
  }

  const { data: ca, error } = await (admin.from("corrective_actions") as any)
    .insert({
      importer_id: importerId,
      supplier_id,
      // Was food_id — a column dropped with the legacy `foods` table, which
      // made every insert fail whether or not a food was given.
      product_id: product_id || null,
      issue_description,
      triggered_by,
      status: "open",
      triggered_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id: importerId,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: "corrective_action_created",
    record_type: "corrective_actions",
    record_id: ca.id,
    new_value: { supplier_id, product_id: product_id || null, issue_description, triggered_by },
  });

  return NextResponse.json({ id: ca.id });
}
