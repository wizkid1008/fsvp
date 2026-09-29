import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import { getPreviewRole, resolveEffectiveRole, resolvePreviewedAccountId } from "@/lib/preview-role";
import { loadEvidenceOverview } from "@/lib/dashboard/evidence-overview";
import type { AppRole } from "@/types/platform";

export const runtime = "edge";

/**
 * The importer dashboard's "Required evidence" card, in a request of its own —
 * see lib/dashboard/evidence-overview.ts for why it cannot share the page's.
 *
 * Resolves the importer exactly as app/dashboard/page.tsx does: a real importer
 * reads its own tenant through its own session; an administrator previewing an
 * importer reads the picked account through the admin client, since the admin's
 * session belongs to no tenant.
 */
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const realRole = (profile?.role ?? "supplier") as AppRole;
  if (resolveEffectiveRole(realRole, getPreviewRole()) !== "us_importer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let client: { from: (table: string) => any } = supabase;
  let importerId: string | null = profile?.importer_id ?? null;

  if (realRole === "administrator") {
    const adminResult = tryAdminClient();
    if (!adminResult.ok) return NextResponse.json({ error: adminResult.message }, { status: 500 });
    client = adminResult.client;
    importerId = resolvePreviewedAccountId(realRole, null);
    // The preview cookie may name a supplier left over from another role.
    const { data: importer } = importerId
      ? await (client.from("importers") as any).select("id").eq("id", importerId).maybeSingle()
      : { data: null };
    if (!importer) importerId = null;
  }

  if (!importerId) return NextResponse.json({ error: "No importer account" }, { status: 404 });

  try {
    return NextResponse.json({ rows: await loadEvidenceOverview(client, importerId) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
