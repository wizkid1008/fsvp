import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.supplier_id) {
    return NextResponse.json({ error: "No supplier record linked to your account." }, { status: 403 });
  }

  if (!["supplier", "exporter", "administrator"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    primary_name?:       string;
    primary_title?:      string;
    primary_phone?:      string;
    primary_email?:      string;
    regulatory_name?:    string;
    regulatory_title?:   string;
    regulatory_phone?:   string;
    regulatory_email?:   string;
  };

  // Fetch existing contact_json so we can merge
  const admin = createAdminSupabaseClient();
  const { data: supplier } = await (admin.from("suppliers") as any)
    .select("contact_json")
    .eq("id", profile.supplier_id)
    .maybeSingle();

  const existing = (supplier?.contact_json ?? {}) as Record<string, string>;

  const merged = {
    ...existing,
    ...(body.primary_name       !== undefined && { primary_name:       body.primary_name.trim() }),
    ...(body.primary_title      !== undefined && { primary_title:      body.primary_title.trim() }),
    ...(body.primary_phone      !== undefined && { primary_phone:      body.primary_phone.trim() }),
    ...(body.primary_email      !== undefined && { primary_email:      body.primary_email.trim().toLowerCase() }),
    ...(body.regulatory_name    !== undefined && { regulatory_name:    body.regulatory_name.trim() }),
    ...(body.regulatory_title   !== undefined && { regulatory_title:   body.regulatory_title.trim() }),
    ...(body.regulatory_phone   !== undefined && { regulatory_phone:   body.regulatory_phone.trim() }),
    ...(body.regulatory_email   !== undefined && { regulatory_email:   body.regulatory_email.trim().toLowerCase() }),
  };

  const { error } = await (admin.from("suppliers") as any)
    .update({ contact_json: merged })
    .eq("id", profile.supplier_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, contact_json: merged });
}
