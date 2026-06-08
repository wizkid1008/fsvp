// POST { document_id, requirement_item_id?, notes? }  → attach accepted doc to record
// DELETE { document_id }                              → detach doc from record

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

const ALLOWED_ROLES = new Set(["us_importer", "reviewer", "administrator"]);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.has(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const { id } = params;
  const body = await req.json();
  const { document_id, requirement_item_id, notes } = body as {
    document_id: string;
    requirement_item_id?: string;
    notes?: string;
  };

  if (!document_id) return NextResponse.json({ error: "document_id required" }, { status: 400 });

  // Verify the record exists and belongs to this importer
  const { data: record } = await (admin.from("fsvp_records") as any)
    .select("importer_id, supplier_id")
    .eq("id", id)
    .maybeSingle();

  if (!record) return NextResponse.json({ error: "FSVP record not found" }, { status: 404 });
  if (record.importer_id !== profile.importer_id && profile.role !== "administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify the document is accepted
  const { data: doc } = await (admin.from("documents") as any)
    .select("id, evidence_status, supplier_id")
    .eq("id", document_id)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (doc.evidence_status !== "accepted") {
    return NextResponse.json({ error: "Only accepted documents can be attached to an FSVP record." }, { status: 400 });
  }

  const { error } = await (admin.from("fsvp_record_evidence") as any)
    .insert({
      fsvp_record_id: id,
      document_id,
      requirement_item_id: requirement_item_id ?? null,
      attached_by_profile_id: user.id,
      notes: notes ?? null,
    });

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Document already attached to this record." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.has(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const { id } = params;
  const { document_id } = await req.json();
  if (!document_id) return NextResponse.json({ error: "document_id required" }, { status: 400 });

  const { data: record } = await (admin.from("fsvp_records") as any)
    .select("importer_id")
    .eq("id", id)
    .maybeSingle();

  if (!record) return NextResponse.json({ error: "FSVP record not found" }, { status: 404 });
  if (record.importer_id !== profile.importer_id && profile.role !== "administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await (admin.from("fsvp_record_evidence") as any)
    .delete()
    .eq("fsvp_record_id", id)
    .eq("document_id", document_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
