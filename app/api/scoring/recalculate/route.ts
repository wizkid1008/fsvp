import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { scoreFacility, scoreProduct, scoreFsvpRecord } from "@/lib/scoring";

export const runtime = "edge";

const ALLOWED_ROLES = new Set(["reviewer", "administrator", "us_importer"]);

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.has(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { entity_type, entity_id, rule_version_id } = body as {
    entity_type: "facility" | "product" | "fsvp_record";
    entity_id: string;
    rule_version_id: string;
    facility_id?: string;
    product_id?: string;
  };

  if (!entity_type || !entity_id || !rule_version_id) {
    return NextResponse.json(
      { error: "entity_type, entity_id, and rule_version_id are required" },
      { status: 400 }
    );
  }

  try {
    let result;

    if (entity_type === "facility") {
      result = await scoreFacility(entity_id, rule_version_id);
    } else if (entity_type === "product") {
      result = await scoreProduct(entity_id, rule_version_id);
    } else if (entity_type === "fsvp_record") {
      const { facility_id, product_id } = body as {
        facility_id: string;
        product_id: string;
      };
      if (!facility_id || !product_id) {
        return NextResponse.json(
          { error: "facility_id and product_id are required for fsvp_record scoring" },
          { status: 400 }
        );
      }
      result = await scoreFsvpRecord(entity_id, facility_id, product_id, rule_version_id);
    } else {
      return NextResponse.json({ error: "Invalid entity_type" }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scoring failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
