// POST { id? } — marks one notification (or, if omitted, all unread notifications
// visible to the caller) as read. RLS scopes rows to the caller's importer tenant.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { id } = body as { id?: string };

  const now = new Date().toISOString();
  let query = (supabase.from("app_notifications") as any).update({ read_at: now });
  query = id ? query.eq("id", id) : query.is("read_at", null);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
