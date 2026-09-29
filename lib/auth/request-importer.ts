import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import { getPreviewRole, resolveEffectiveRole, resolvePreviewedAccountId } from "@/lib/preview-role";
import type { AppRole } from "@/types/platform";

type SupabaseLike = { from: (table: string) => any };

/**
 * Which importer an importer-view API request is about, and the client to read
 * it with — resolved exactly as app/dashboard/page.tsx resolves it.
 *
 * A real importer reads its own tenant through its own session. An
 * administrator previewing an importer reads the picked account through the
 * admin client, since the admin's session belongs to no tenant; every caller
 * then filters by the returned importerId, so bypassing RLS does not widen
 * what is shown.
 *
 * The route identifies the caller itself (auth.getUser() in the route file is
 * what lib/quality/app-invariants.test.ts checks every route for) and passes
 * the session and user in. Returns a ready NextResponse on any refusal, so a
 * route can hand it straight back.
 */
export async function resolveRequestImporter(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  user: { id: string } | null
): Promise<
  { ok: true; client: SupabaseLike; importerId: string } | { ok: false; response: NextResponse }
> {
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const realRole = (profile?.role ?? "supplier") as AppRole;
  if (resolveEffectiveRole(realRole, getPreviewRole()) !== "us_importer") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (realRole !== "administrator") {
    const importerId: string | null = profile?.importer_id ?? null;
    if (!importerId) return { ok: false, response: NextResponse.json({ error: "No importer account" }, { status: 404 }) };
    return { ok: true, client: supabase, importerId };
  }

  const adminResult = tryAdminClient();
  if (!adminResult.ok) {
    return { ok: false, response: NextResponse.json({ error: adminResult.message }, { status: 500 }) };
  }
  const importerId = resolvePreviewedAccountId(realRole, null);
  // The preview cookie may name a supplier left over from another role.
  const { data: importer } = importerId
    ? await (adminResult.client.from("importers") as any).select("id").eq("id", importerId).maybeSingle()
    : { data: null };
  if (!importer) return { ok: false, response: NextResponse.json({ error: "No importer account" }, { status: 404 }) };

  return { ok: true, client: adminResult.client, importerId: importer.id };
}
