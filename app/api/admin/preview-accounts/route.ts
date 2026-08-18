import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { EXPORTER_TYPES, MANUFACTURER_TYPES } from "@/lib/supplier-context";
import { normalizeImporterName } from "@/lib/importers/names";

export const runtime = "edge";

type ImporterPreviewRow = {
  id: string;
  display_name: string;
  legal_name: string | null;
  primary_contact_email: string | null;
  status: string | null;
  created_at: string | null;
};

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
      .select("id, display_name, legal_name, primary_contact_email, status, created_at")
      .order("display_name")
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as ImporterPreviewRow[];
    const importerIds = rows.map((row) => row.id);
    const { data: profileRows } = importerIds.length
      ? await (admin.from("profiles") as any)
          .select("importer_id")
          .in("importer_id", importerIds)
      : { data: [] };

    const usersByImporter = new Map<string, number>();
    for (const profile of (profileRows ?? []) as Array<{ importer_id: string | null }>) {
      if (!profile.importer_id) continue;
      usersByImporter.set(profile.importer_id, (usersByImporter.get(profile.importer_id) ?? 0) + 1);
    }

    const duplicatesByName = new Map<string, number>();
    for (const row of rows) {
      const key = normalizeImporterName(row.display_name);
      if (!key) continue;
      duplicatesByName.set(key, (duplicatesByName.get(key) ?? 0) + 1);
    }

    const accounts = rows.map((row) => {
      const accountCount = usersByImporter.get(row.id) ?? 0;
      const duplicateCount = duplicatesByName.get(normalizeImporterName(row.display_name)) ?? 1;
      const detailParts = [
        row.legal_name && row.legal_name !== row.display_name ? row.legal_name : null,
        row.primary_contact_email,
        `${accountCount} user${accountCount === 1 ? "" : "s"}`,
        duplicateCount > 1 ? `${duplicateCount} orgs share this name` : null,
      ].filter(Boolean);

      return {
        id: row.id,
        company_name: row.display_name,
        legal_name: row.legal_name,
        primary_contact_email: row.primary_contact_email,
        account_count: accountCount,
        duplicate_count: duplicateCount,
        status: row.status,
        created_at: row.created_at,
        detail: detailParts.join(" • "),
      };
    });
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
