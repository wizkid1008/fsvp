import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { EXPORTER_TYPES, MANUFACTURER_TYPES } from "@/lib/supplier-context";

export const runtime = "edge";

async function assertAdmin(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.role === "administrator" ? user : null;
}

// Lists real supplier/exporter accounts an admin can pick to preview the
// dashboard as. Read-only, admin-gated, used by the RolePreviewSelector.
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const user = await assertAdmin(supabase);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const role = req.nextUrl.searchParams.get("role");
  const admin = createAdminSupabaseClient();

  if (role === "us_importer") {
    const { data, error } = await (admin.from("importers") as any)
      .select("id, display_name")
      .order("display_name")
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const accounts = (data ?? []).map((row: { id: string; display_name: string }) => ({
      id: row.id,
      company_name: row.display_name,
    }));
    return NextResponse.json({ accounts });
  }

  const types = role === "exporter" ? EXPORTER_TYPES : role === "supplier" ? MANUFACTURER_TYPES : null;
  if (!types) return NextResponse.json({ error: "role must be supplier, exporter, or us_importer" }, { status: 400 });

  const { data, error } = await (admin.from("suppliers") as any)
    .select("id, company_name, supplier_type")
    .in("supplier_type", types as unknown as string[])
    .order("company_name")
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ accounts: data ?? [] });
}
