// POST { supplier_id, facility_id, product_id, rule_version_id } → create FSVP record

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  fetchDetermination,
  isHardRecordCreationBlock,
  recordCreationBlock,
} from "@/lib/fsvp/applicability";
import { ruleVersionBlock } from "@/lib/fsvp/rule-version";

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

  // Validate the rule version is published AND belongs to a rule set that can
  // govern an FSVP record. Checking only "published" let any set through --
  // a facility-scoped version would have been accepted here.
  const ruleBlock = await ruleVersionBlock(admin, rule_version_id);
  if (ruleBlock) {
    return NextResponse.json({ error: ruleBlock }, { status: 400 });
  }

  // Validate the supplier/facility/product graph. Previously none of this was
  // checked server-side — the /new form filtered the dropdowns in browser
  // memory only, so a hand-crafted request could open an FSVP record against an
  // exporter the importer has no relationship with, or pair a facility and
  // product belonging to different suppliers.
  const { data: link } = await (admin.from("supplier_relationships") as any)
    .select("id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", profile.importer_id)
    .eq("supplier_id", supplier_id)
    .in("status", ["active", "pending_invite"])
    .maybeSingle();

  if (!link) {
    return NextResponse.json(
      { error: "That exporter is not linked to your organization. Link or add them first." },
      { status: 403 }
    );
  }

  const [{ data: facility }, { data: product }, { data: sharedAccess }] = await Promise.all([
    (admin.from("facilities_verify") as any)
      .select("id, supplier_id")
      .eq("id", facility_id)
      .maybeSingle(),
    (admin.from("products_verify") as any)
      .select("id, supplier_id, facility_id")
      .eq("id", product_id)
      .maybeSingle(),
    (admin.from("facility_supplier_access") as any)
      .select("facility_id")
      .eq("facility_id", facility_id)
      .eq("supplier_id", supplier_id)
      .maybeSingle(),
  ]);

  if (!facility || (facility.supplier_id !== supplier_id && !sharedAccess)) {
    return NextResponse.json(
      { error: "That facility does not belong to the selected exporter." },
      { status: 400 }
    );
  }

  if (!product || product.supplier_id !== supplier_id) {
    return NextResponse.json(
      { error: "That product does not belong to the selected exporter." },
      { status: 400 }
    );
  }

  if (product.facility_id && product.facility_id !== facility_id) {
    return NextResponse.json(
      { error: "That product is produced at a different facility than the one selected." },
      { status: 400 }
    );
  }

  // Does FSVP apply to this food at all? § 1.501 exempts whole categories, and
  // an exempt pair does not need a record — the determination IS the record,
  // so opening one contradicts the importer's own filing.
  //
  // An undetermined or lapsed pair is a different matter: the step is
  // outstanding, not answered. A draft record claims nothing, and
  // ./[id]/approve/route.ts re-reads the determination and refuses to approve
  // without a live one, so the work can be started without it being relied on.
  const determination = await fetchDetermination(admin, profile.importer_id, supplier_id, product_id);
  const block = recordCreationBlock(determination);
  if (block && isHardRecordCreationBlock(block)) {
    return NextResponse.json(
      { error: block.message, outcome: determination?.outcome ?? null },
      { status: 409 }
    );
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
