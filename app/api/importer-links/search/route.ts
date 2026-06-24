import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const admin = createAdminSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "us_importer" || !profile.importer_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const importerId: string = profile.importer_id;
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  // Get already-linked supplier IDs
  const { data: existing } = await (admin.from("supplier_relationships") as any)
    .select("supplier_id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", importerId);

  const linkedIds = ((existing ?? []) as Array<{ supplier_id: string }>).map((r) => r.supplier_id);

  // Search suppliers not yet linked
  let query = (admin.from("suppliers") as any)
    .select("id, company_name, legal_entity_name, country, fda_registration_number, approval_status, supplier_type")
    .in("supplier_type", ["exporter", "exporter_manufacturer", "trader"])
    .order("company_name")
    .limit(20);

  if (q) {
    query = query.ilike("company_name", `%${q}%`);
  }

  if (linkedIds.length > 0) {
    query = query.not("id", "in", `(${linkedIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ suppliers: data ?? [] });
}
