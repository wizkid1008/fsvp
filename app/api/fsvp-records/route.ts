// POST { supplier_id, facility_id, product_id, rule_version_id } → create FSVP record

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["us_importer", "administrator"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!profile.importer_id) {
    return NextResponse.json({ error: "Your account is not linked to an importer organization." }, { status: 400 });
  }

  const body = await req.json();
  const { supplier_id, facility_id, product_id, rule_version_id } = body as {
    supplier_id: string;
    facility_id: string;
    product_id: string;
    rule_version_id: string;
  };

  if (!supplier_id || !facility_id || !product_id || !rule_version_id) {
    return NextResponse.json({ error: "supplier_id, facility_id, product_id, and rule_version_id are required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // Validate the rule version is published
  const { data: ruleVer } = await (admin.from("rule_versions") as any)
    .select("status")
    .eq("id", rule_version_id)
    .maybeSingle();
  if (!ruleVer || ruleVer.status !== "published") {
    return NextResponse.json({ error: "rule_version_id must reference a published rule version." }, { status: 400 });
  }

  const { data: record, error } = await (admin.from("fsvp_records") as any)
    .insert({
      importer_id: profile.importer_id,
      supplier_id,
      facility_id,
      product_id,
      rule_version_id,
      status: "draft",
      created_by_profile_id: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "An FSVP record for this supplier/facility/product combination already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id: profile.importer_id,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: "fsvp_record_created",
    record_type: "fsvp_records",
    record_id: record.id,
    new_value: { supplier_id, facility_id, product_id, rule_version_id },
  });

  return NextResponse.json({ id: record.id });
}
