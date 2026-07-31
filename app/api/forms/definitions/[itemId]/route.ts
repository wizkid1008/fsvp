// GET — the form backing a requirement item, plus where this supplier has got to
// with it.
//
// Returns the current draft if there is one, otherwise the most recent
// submission along with the review status of the document it produced, so the
// fill panel can show "rejected — here is what the reviewer said" rather than a
// blank form.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

export async function GET(
  req: NextRequest,
  { params }: { params: { itemId: string } }
) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, supplier_id, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminSupabaseClient();
  const { itemId } = params;

  const { data: definition } = await (admin.from("form_definitions") as any)
    .select("id, form_key, title, description, schema_json, requirement_item_id")
    .eq("requirement_item_id", itemId)
    .maybeSingle();

  if (!definition) {
    return NextResponse.json({ error: "No form is configured for this requirement." }, { status: 404 });
  }

  const supplierId = req.nextUrl.searchParams.get("supplier_id") || profile.supplier_id || "";
  if (!supplierId) {
    return NextResponse.json({ definition, response: null });
  }

  // A supplier only ever sees their own; an importer must be linked to the one
  // they are asking about.
  if (profile.supplier_id) {
    if (supplierId !== profile.supplier_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (profile.importer_id) {
    const { data: link } = await (admin.from("supplier_relationships") as any)
      .select("supplier_id")
      .eq("relationship_type", "importer_supplier")
      .eq("importer_id", profile.importer_id)
      .eq("supplier_id", supplierId)
      .in("status", ["active", "pending_invite"])
      .maybeSingle();
    if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: rows } = await (admin.from("form_responses") as any)
    .select(`
      id, version, answers_json, status, document_id, submitted_at,
      documents(evidence_status, review_notes)
    `)
    .eq("form_definition_id", definition.id)
    .eq("supplier_id", supplierId)
    .order("version", { ascending: false });

  const responses = (rows ?? []) as Array<{
    id: string;
    version: number;
    answers_json: Record<string, unknown>;
    status: string;
    document_id: string | null;
    submitted_at: string | null;
    documents: { evidence_status: string | null; review_notes: string | null } | null;
  }>;

  // A draft is what they are working on; otherwise show the latest submission so
  // its review outcome and answers are the starting point for a resubmission.
  const draft = responses.find((r) => r.status === "draft");
  const latestSubmitted = responses.find((r) => r.status === "submitted");
  const current = draft ?? latestSubmitted ?? null;

  return NextResponse.json({
    definition,
    response: current
      ? {
          id:              current.id,
          version:         current.version,
          answers:         current.answers_json ?? {},
          status:          current.status,
          submitted_at:    current.submitted_at,
          review_status:   current.documents?.evidence_status ?? null,
          review_notes:    current.documents?.review_notes ?? null,
        }
      : null,
    history: responses
      .filter((r) => r.status === "submitted")
      .map((r) => ({
        version:       r.version,
        submitted_at:  r.submitted_at,
        review_status: r.documents?.evidence_status ?? null,
        document_id:   r.document_id,
      })),
  });
}
