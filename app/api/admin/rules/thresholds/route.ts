// PATCH { version_id, thresholds: [{ id, label, min_score, max_score, resulting_status }] }

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
  const { version_id, thresholds } = body as {
    version_id: string;
    thresholds: Array<{ id: string; label: string; min_score: number; max_score: number; resulting_status: string }>;
  };

  if (!version_id || !Array.isArray(thresholds)) {
    return NextResponse.json({ error: "version_id and thresholds array required" }, { status: 400 });
  }

  const { data: ver } = await (admin.from("rule_versions") as any)
    .select("status").eq("id", version_id).maybeSingle();
  if (ver?.status === "published") {
    return NextResponse.json({ error: "Cannot edit a published version. Clone first." }, { status: 400 });
  }

  // Validate no overlapping ranges
  const sorted = [...thresholds].sort((a, b) => a.min_score - b.min_score);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].max_score >= sorted[i + 1].min_score) {
      return NextResponse.json(
        { error: `Threshold ranges overlap: "${sorted[i].label}" and "${sorted[i + 1].label}"` },
        { status: 400 }
      );
    }
  }

  for (const t of thresholds) {
    await (admin.from("approval_thresholds") as any)
      .update({ label: t.label, min_score: t.min_score, max_score: t.max_score, resulting_status: t.resulting_status })
      .eq("id", t.id)
      .eq("rule_version_id", version_id);
  }

  return NextResponse.json({ success: true });
}
