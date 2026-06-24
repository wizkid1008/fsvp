import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const supplierId: string | undefined = body.supplier_id;
  if (!supplierId) return NextResponse.json({ error: "supplier_id required" }, { status: 400 });

  const importerId: string = profile.importer_id;

  // Verify supplier exists
  const { data: supplier } = await (admin.from("suppliers") as any)
    .select("id")
    .eq("id", supplierId)
    .maybeSingle();
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  // Check for existing link
  const { data: existing } = await (admin.from("supplier_relationships") as any)
    .select("id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", importerId)
    .eq("supplier_id", supplierId)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: "Already linked" }, { status: 409 });

  const { error } = await (admin.from("supplier_relationships") as any).insert({
    relationship_type: "importer_supplier",
    importer_id: importerId,
    supplier_id: supplierId,
    status: "active",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
