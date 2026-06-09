import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { token?: string; decline?: boolean };
  const token = body.token?.trim() ?? "";
  const declining = body.decline === true;

  if (!token) {
    return NextResponse.json({ error: "Invite token is required." }, { status: 400 });
  }

  // Find the link by token
  const { data: link } = await (supabase.from("exporter_supplier_links") as any)
    .select("id, exporter_id, supplier_id, status, invite_email")
    .eq("invite_token", token)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: "Invite not found or already used." }, { status: 404 });
  }

  if (link.status === "active") {
    return NextResponse.json({ ok: true, already_active: true });
  }
  if (link.status === "declined") {
    return NextResponse.json({ error: "This invite was already declined." }, { status: 409 });
  }

  // Link the current user's profile to the supplier record if not already linked
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.supplier_id) {
    await (supabase.from("profiles") as any)
      .update({ supplier_id: link.supplier_id })
      .eq("id", user.id);
  }

  // Update link status
  const now = new Date().toISOString();
  await (supabase.from("exporter_supplier_links") as any)
    .update(declining
      ? { status: "declined", declined_at: now }
      : { status: "active",  accepted_at: now, invite_token: null }
    )
    .eq("id", link.id);

  return NextResponse.json({ ok: true, declined: declining });
}

// GET: look up a pending invite by token (used on the accept-invite page)
export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json({ error: "Token required." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: link } = await (supabase.from("exporter_supplier_links") as any)
    .select(`
      id, status, invite_email,
      exporter:exporter_id ( company_name ),
      supplier:supplier_id ( company_name )
    `)
    .eq("invite_token", token)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  return NextResponse.json({ link });
}
