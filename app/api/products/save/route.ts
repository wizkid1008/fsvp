// POST { id?, product_name, supplier_id, facility_id, country_of_origin, raw_or_processed,
//        intended_use, ingredient_list, allergen_information, product_description }
// Creates or updates a product. Uses the admin client for the write so RLS never blocks a
// legitimate save — the same broken-FK/overlapping-policy issue documented in
// app/api/documents/upload/route.ts also affects products_verify (multiple RLS policies from
// different schema generations don't agree on importer/admin-on-behalf-of-supplier writes).
// Authorization is enforced here instead: a supplier may only write their own supplier_id;
// reviewers/importers/admins may write any supplier's product.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isCrossTenant } from "@/lib/auth/tenancy";
import { ACTIVE_LINK_STATUSES, canWriteSupplierEntity } from "@/lib/auth/entity-access";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, supplier_id, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const body = await req.json();
  const {
    id, product_name, supplier_id, facility_id, country_of_origin,
    raw_or_processed, intended_use, ingredient_list, allergen_information, product_description,
  } = body as Record<string, string | null | undefined>;

  if (!product_name || !supplier_id || !facility_id || !country_of_origin) {
    return NextResponse.json({ error: "product_name, supplier_id, facility_id, and country_of_origin are required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // Shared with /api/facilities via lib/auth/entity-access.ts. These two routes
  // used to carry separate copies of this rule and they disagreed: the facility
  // one had no importer branch at all, so an importer could never create the
  // facility a product requires.
  const { data: linkRows } = await (admin.from("supplier_relationships") as any)
    .select("relationship_type, status, supplier_id, exporter_id, importer_id")
    .eq("supplier_id", supplier_id)
    .in("status", ACTIVE_LINK_STATUSES as unknown as string[]);

  if (!canWriteSupplierEntity(profile, supplier_id, linkRows ?? [])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isPlatformWide = isCrossTenant(profile);

  let existing: {
    id: string;
    supplier_id: string | null;
    country_of_origin: string | null;
  } | null = null;

  if (id) {
    const { data } = await (admin.from("products_verify") as any)
      .select("id, supplier_id, country_of_origin")
      .eq("id", id)
      .maybeSingle();
    existing = data;
    if (!existing) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    if (existing.supplier_id !== supplier_id && !isPlatformWide) {
      return NextResponse.json(
        { error: "A product cannot be moved from another supplier into this account." },
        { status: 403 }
      );
    }

    if (existing.country_of_origin !== country_of_origin && profile.importer_id) {
      const { data: liveDeterminations, error: determinationCheckError } = await (
        admin.from("admissibility_determinations") as any
      )
        .select("id, importer_id")
        .eq("product_id", existing.id)
        .is("superseded_at", null);
      if (determinationCheckError) {
        return NextResponse.json(
          { error: `Existing determinations could not be checked, so the origin change was refused. ${determinationCheckError.message}` },
          { status: 503 }
        );
      }
      if ((liveDeterminations ?? []).some(
        (row: { importer_id: string }) => row.importer_id !== profile.importer_id
      )) {
        return NextResponse.json(
          {
            error:
              "Another importer has a live determination for this shared supplier product. " +
              "Changing its origin would invalidate their record, so the shared product must be " +
              "resolved before this edit can be saved.",
          },
          { status: 409 }
        );
      }
    }
  }

  const facility = await (admin.from("facilities_verify") as any)
    .select("id, supplier_id")
    .eq("id", facility_id)
    .maybeSingle();

  if (facility.error || !facility.data || facility.data.supplier_id !== supplier_id) {
    return NextResponse.json({ error: "Select a facility that belongs to the selected supplier." }, { status: 400 });
  }

  const record: Record<string, unknown> = {
    product_name,
    supplier_id,
    facility_id,
    country_of_origin,
    raw_or_processed: raw_or_processed || null,
    intended_use: intended_use || null,
    ingredient_list: ingredient_list || null,
    allergen_information: allergen_information || null,
    product_description: product_description || null,
  };
  if (profile.importer_id) record.importer_id = profile.importer_id;

  const result = id
    ? await (admin.from("products_verify") as any).update(record).eq("id", id).select("id").single()
    : await (admin.from("products_verify") as any).insert(record).select("id").single();

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  // An origin change invalidates the question answered by every live
  // admissibility snapshot. Preserve the history and require a fresh answer.
  if (existing && existing.country_of_origin !== country_of_origin) {
    const { error: supersedeError } = await (admin.from("admissibility_determinations") as any)
      .update({ superseded_at: new Date().toISOString() })
      .eq("product_id", existing.id)
      .is("superseded_at", null);
    if (supersedeError) {
      await (admin.from("products_verify") as any)
        .update({ country_of_origin: existing.country_of_origin })
        .eq("id", existing.id);
      return NextResponse.json(
        { error: `The origin could not be changed safely. ${supersedeError.message}` },
        { status: 500 }
      );
    }

    await (admin.from("audit_logs") as any).insert({
      importer_id: profile.importer_id ?? null,
      actor_profile_id: user.id,
      actor_role: profile.role,
      action: "product_origin_changed",
      record_type: "products_verify",
      record_id: existing.id,
      previous_value: { country_of_origin: existing.country_of_origin },
      new_value: {
        country_of_origin,
        admissibility_determinations_superseded: true,
      },
    });
  }

  return NextResponse.json({ id: result.data.id });
}
