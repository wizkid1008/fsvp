// PATCH { version_id, weights: [{ section_id, weight_percent }] }
// Bulk-updates weights for a draft version.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

async function assertAdmin(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await (supabase.from("profiles") as any)
    .select("role").eq("id", user.id).maybeSingle();
  return p?.role === "administrator" ? user : null;
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const user = await assertAdmin(supabase);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const body = await req.json();
  const { version_id, weights } = body as {
    version_id: string;
    weights: Array<{ section_id: string; weight_percent: number }>;
  };

  if (!version_id || !Array.isArray(weights)) {
    return NextResponse.json({ error: "version_id and weights array required" }, { status: 400 });
  }

  const { data: ver } = await (admin.from("rule_versions") as any)
    .select("status").eq("id", version_id).maybeSingle();
  if (ver?.status === "published") {
    return NextResponse.json({ error: "Published versions cannot be edited. Clone first." }, { status: 400 });
  }

  for (const w of weights) {
    await (admin.from("scoring_category_weights") as any)
      .update({ weight_percent: w.weight_percent })
      .eq("rule_version_id", version_id)
      .eq("section_id", w.section_id);
  }

  return NextResponse.json({ success: true });
}
