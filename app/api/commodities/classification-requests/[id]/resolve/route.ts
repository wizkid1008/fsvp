// POST — an administrator answers a classification request.
//
// Resolving points the request at a commodity. It does NOT classify the
// product, and that restraint is deliberate: /api/products/classify refuses
// anyone but the US importer with the words "the US importer responsible for
// the movement must classify this product", because that is where FSVP puts the
// responsibility. An administrator silently classifying on the importer's
// behalf would contradict the rule one route over and attribute a judgement to
// someone who did not make it.
//
// So the administrator supplies the missing commodity; the importer still
// chooses it. What changes is that there is now something correct to choose.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "administrator") {
    return NextResponse.json(
      { error: "Only a platform administrator maintains the commodity taxonomy." },
      { status: 403 }
    );
  }

  const requestId = params.id?.trim() ?? "";
  if (!requestId) return NextResponse.json({ error: "No request identified." }, { status: 400 });

  const body = await req.json().catch(() => ({})) as {
    action?: "resolve" | "decline";
    commodity_id?: string;
    resolution_note?: string;
  };

  const action = body.action;
  if (action !== "resolve" && action !== "decline") {
    return NextResponse.json({ error: "Say whether this is resolved or declined." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: request } = await (admin.from("commodity_classification_requests") as any)
    .select("id, status, importer_id, product_id, described_as")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) return NextResponse.json({ error: "That request does not exist." }, { status: 404 });
  if (request.status !== "open") {
    return NextResponse.json(
      { error: `This request was already ${request.status}. Reopening is not something this screen does.` },
      { status: 409 }
    );
  }

  const note = body.resolution_note?.trim() || null;
  const resolvedAt = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status:                 action === "resolve" ? "resolved" : "declined",
    resolution_note:        note,
    resolved_by_profile_id: user.id,
    resolved_at:            resolvedAt,
  };

  if (action === "resolve") {
    const commodityId = body.commodity_id?.trim() ?? "";
    if (!commodityId) {
      return NextResponse.json(
        { error: "Name the commodity to use. Closing a request with nothing to act on reads as an answer." },
        { status: 400 }
      );
    }

    const { data: commodity } = await (admin.from("commodities") as any)
      .select("id, common_name, active")
      .eq("id", commodityId)
      .eq("active", true)
      .maybeSingle();

    if (!commodity) {
      return NextResponse.json({ error: "That commodity is not active in the taxonomy." }, { status: 404 });
    }
    patch.resolved_commodity_id = commodityId;
  } else if (!note || note.length < 3) {
    // The check constraint enforces this too; saying it here gives the
    // administrator a sentence rather than a constraint violation.
    return NextResponse.json(
      {
        error:
          "Say why the request is declined. A refusal with no reason sends the importer back to " +
          "guessing, which is the behaviour this queue exists to stop.",
      },
      { status: 400 }
    );
  }

  const { error } = await (admin.from("commodity_classification_requests") as any)
    .update(patch)
    .eq("id", requestId)
    .eq("status", "open");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (admin.from("audit_logs") as any).insert({
    // The request belongs to a tenant even though the actor does not.
    importer_id:      request.importer_id,
    actor_profile_id: user.id,
    actor_role:       profile.role,
    action:           action === "resolve"
                        ? "commodity_classification_resolved"
                        : "commodity_classification_declined",
    record_type:      "commodity_classification_requests",
    record_id:        requestId,
    previous_value:   { status: "open" },
    new_value:        patch,
  });

  return NextResponse.json({ ok: true, status: patch.status });
}
