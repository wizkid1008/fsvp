// GET  → list corrective actions (or suppliers if ?list_suppliers=1)
// POST → create a new corrective action

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isTenantConfined } from "@/lib/auth/tenancy";

export const runtime = "edge";

const ALLOWED_ROLES = new Set(["us_importer", "reviewer", "administrator"]);

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
    // Suppliers linked to this importer, for dropdown population. This read
    // importer_supplier_links / foreign_suppliers, both dropped in the baseline;
    // the query errored, the error was ignored, and every dropdown fed by it
    // said "No linked suppliers found". Same source as the readiness page.
    if (!ALLOWED_ROLES.has(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!profile.importer_id) return NextResponse.json({ suppliers: [] });

    const admin = createAdminSupabaseClient();
    const { data: links, error: linkErr } = await (admin.from("supplier_relationships") as any)
      .select("supplier_id")
      .eq("relationship_type", "importer_supplier")
      .eq("importer_id", profile.importer_id)
      .in("status", ["active", "pending_invite"]);
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

    const ids = ((links ?? []) as Array<{ supplier_id: string | null }>)
      .map((l) => l.supplier_id)
      .filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ suppliers: [] });

    const { data: rows, error: rowErr } = await (admin.from("suppliers") as any)
      .select("id, company_name")
      .in("id", ids)
      .order("company_name");
    if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });

    const suppliers = ((rows ?? []) as Array<{ id: string; company_name: string }>).map((s) => ({
      id: s.id,
      supplier_name: s.company_name,
    }));
    return NextResponse.json({ suppliers });
  }

  // List corrective actions
  let query = (supabase.from("corrective_actions") as any)
    .select("id, issue_description, triggered_by, status, triggered_at, closed_at, supplier_id, food_id, investigation_summary, action_taken, decision")
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
  const { supplier_id, issue_description, triggered_by, food_id } = body as {
    supplier_id: string;
    issue_description: string;
    triggered_by: string;
    food_id?: string;
  };

  if (!supplier_id || !issue_description || !triggered_by) {
    return NextResponse.json({ error: "supplier_id, issue_description, and triggered_by are required" }, { status: 400 });
  }

  const validTriggers = ["verification_finding", "recall", "consumer_complaint", "inspector_finding", "reassessment", "other"];
  if (!validTriggers.includes(triggered_by)) {
    return NextResponse.json({ error: "Invalid triggered_by value" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: ca, error } = await (admin.from("corrective_actions") as any)
    .insert({
      importer_id: profile.importer_id,
      supplier_id,
      food_id: food_id ?? null,
      issue_description,
      triggered_by,
      status: "open",
      triggered_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    importer_id: profile.importer_id,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: "corrective_action_created",
    record_type: "corrective_actions",
    record_id: ca.id,
    new_value: { supplier_id, issue_description, triggered_by },
  });

  return NextResponse.json({ id: ca.id });
}
