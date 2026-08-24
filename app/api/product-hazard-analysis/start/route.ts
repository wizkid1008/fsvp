import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { fetchDetermination, recordCreationBlock } from "@/lib/fsvp/applicability";
import { fetchGoverningRuleVersion } from "@/lib/fsvp/rule-version";
import { refusePreviewWrite } from "@/lib/auth/preview-guard";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["us_importer", "reviewer", "administrator"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const previewRefusal = refusePreviewWrite(profile.role, "create a product hazard analysis");
  if (previewRefusal) return previewRefusal;

  if (!profile.importer_id) {
    return NextResponse.json(
      { error: "Your account is not linked to an importing organization." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({})) as { product_id?: string };
  const productId = body.product_id?.trim();
  if (!productId) return NextResponse.json({ error: "product_id is required." }, { status: 400 });

  const admin = createAdminSupabaseClient();

  const { data: product } = await (admin.from("products_verify") as any)
    .select("id, supplier_id, facility_id")
    .eq("id", productId)
    .maybeSingle();

  if (!product?.supplier_id) {
    return NextResponse.json({ error: "This product is missing a supplier." }, { status: 400 });
  }
  if (!product.facility_id) {
    return NextResponse.json(
      { error: "Assign this product to a facility before creating its FSVP hazard analysis." },
      { status: 400 }
    );
  }

  const { data: link } = await (admin.from("supplier_relationships") as any)
    .select("id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", profile.importer_id)
    .eq("supplier_id", product.supplier_id)
    .in("status", ["active", "pending_invite"])
    .maybeSingle();

  if (!link) {
    return NextResponse.json(
      { error: "That supplier is not linked to your organization." },
      { status: 403 }
    );
  }

  let { data: record } = await (admin.from("fsvp_records") as any)
    .select("id")
    .eq("importer_id", profile.importer_id)
    .eq("supplier_id", product.supplier_id)
    .eq("facility_id", product.facility_id)
    .eq("product_id", product.id)
    .maybeSingle();

  if (!record) {
    if (profile.role === "reviewer") {
      return NextResponse.json(
        { error: "An importer must open the FSVP record before a reviewer can author its hazard analysis." },
        { status: 403 }
      );
    }

    const determination = await fetchDetermination(admin, profile.importer_id, product.supplier_id, product.id);
    const block = recordCreationBlock(determination);
    if (block) {
      return NextResponse.json(
        { error: block, outcome: determination?.outcome ?? null },
        { status: determination?.outcome === "exempt" ? 409 : 400 }
      );
    }

    const ruleVersion = await fetchGoverningRuleVersion(admin);
    if (!ruleVersion.ok) {
      return NextResponse.json({ error: ruleVersion.error }, { status: 400 });
    }

    const created = await (admin.from("fsvp_records") as any)
      .insert({
        importer_id: profile.importer_id,
        supplier_id: product.supplier_id,
        facility_id: product.facility_id,
        product_id: product.id,
        rule_version_id: ruleVersion.version.id,
        status: "draft",
        created_by_profile_id: user.id,
      })
      .select("id")
      .single();

    if (created.error) {
      if (created.error.code === "23505") {
        const retry = await (admin.from("fsvp_records") as any)
          .select("id")
          .eq("importer_id", profile.importer_id)
          .eq("supplier_id", product.supplier_id)
          .eq("facility_id", product.facility_id)
          .eq("product_id", product.id)
          .maybeSingle();
        record = retry.data;
      } else {
        return NextResponse.json({ error: created.error.message }, { status: 500 });
      }
    } else {
      record = created.data;
      await (admin.from("audit_logs") as any).insert({
        importer_id: profile.importer_id,
        actor_profile_id: user.id,
        actor_role: profile.role,
        action: "fsvp_record_created",
        record_type: "fsvp_records",
        record_id: record.id,
        new_value: {
          supplier_id: product.supplier_id,
          facility_id: product.facility_id,
          product_id: product.id,
          rule_version_id: ruleVersion.version.id,
          source: "product_hazard_analysis_create",
        },
      });
    }
  }

  if (!record?.id) {
    return NextResponse.json({ error: "Unable to open an FSVP record for this product." }, { status: 500 });
  }

  let { data: analysis } = await (admin.from("fsvp_plan_hazard_analyses") as any)
    .select("id")
    .eq("fsvp_record_id", record.id)
    .neq("status", "superseded")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!analysis) {
    const { data: existing } = await (admin.from("fsvp_plan_hazard_analyses") as any)
      .select("version")
      .eq("fsvp_record_id", record.id)
      .order("version", { ascending: false })
      .limit(1);

    const nextVersion = existing?.length > 0 ? existing[0].version + 1 : 1;
    const createdAnalysis = await (admin.from("fsvp_plan_hazard_analyses") as any)
      .insert({
        fsvp_record_id: record.id,
        version: nextVersion,
        status: "draft",
        methodology_notes:
          "Started from the product required-document checklist. Complete the known or reasonably foreseeable hazards, controls, and QI review before relying on this record.",
        created_by_profile_id: user.id,
      })
      .select("id")
      .single();

    if (createdAnalysis.error) {
      return NextResponse.json({ error: createdAnalysis.error.message }, { status: 500 });
    }
    analysis = createdAnalysis.data;
  }

  return NextResponse.json({
    ok: true,
    record_id: record.id,
    hazard_analysis_id: analysis.id,
    href: `/fsvp-records/${record.id}#hazard-analysis`,
  });
}
