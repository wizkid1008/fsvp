import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveRequestImporter } from "@/lib/auth/request-importer";
import { loadEvidenceOverview } from "@/lib/dashboard/evidence-overview";

export const runtime = "edge";

/**
 * The importer dashboard's "Required evidence" card, in a request of its own —
 * see lib/dashboard/evidence-overview.ts for why it cannot share the page's.
 * The importer is resolved as the dashboard resolves it
 * (lib/auth/request-importer.ts).
 */
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const resolved = await resolveRequestImporter(supabase, user);
  if (!resolved.ok) return resolved.response;

  try {
    return NextResponse.json({ rows: await loadEvidenceOverview(resolved.client, resolved.importerId) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
