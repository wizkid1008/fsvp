// GET /api/documents/download?id=<document_id>
// Returns a short-lived signed URL redirect for the document's stored file.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { DOCUMENT_BUCKET } from "@/lib/constants";
import { deniesTenant } from "@/lib/auth/tenancy";

export const runtime = "edge";

const ALLOWED_ROLES = new Set(["reviewer", "administrator", "us_importer", "exporter", "supplier"]);

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, supplier_id, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.has(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data: doc } = await (admin.from("documents") as any)
    .select("id, storage_path, supplier_id, importer_id")
    .eq("id", id)
    .is("soft_deleted_at", null)
    .maybeSingle();

  if (!doc || !doc.storage_path) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Scope check: suppliers/exporters can only download their own docs; anyone
  // holding an importer_id is confined to that tenant (which now includes a
  // tenant-scoped qualified individual); only platform admins and platform
  // reviewers can download any.
  if (profile.role === "supplier" || profile.role === "exporter") {
    if (doc.supplier_id !== profile.supplier_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (deniesTenant(profile, doc.importer_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: signedData, error } = await admin.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(doc.storage_path, 300); // 5-minute link

  if (error || !signedData?.signedUrl) {
    return NextResponse.json({ error: "Could not generate download link" }, { status: 500 });
  }

  return NextResponse.redirect(signedData.signedUrl);
}
