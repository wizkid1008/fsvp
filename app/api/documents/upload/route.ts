import { NextResponse } from "next/server";
import { DOCUMENT_BUCKET } from "@/lib/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export const runtime = "edge";

type DocumentInsertResult = {
  error: { message: string } | null;
};

type DocumentInsertTable = {
  insert(values: Database["public"]["Tables"]["documents"]["Insert"]): Promise<DocumentInsertResult>;
};

export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const documentKind = String(formData.get("document_kind") ?? "unclassified");
  const supplierId = String(formData.get("supplier_id") ?? "");
  const importerId = String(formData.get("importer_id") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file upload is required." }, { status: 400 });
  }

  if (!importerId) {
    return NextResponse.json({ error: "Importer context is required." }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const storagePath = `${importerId}/${supplierId || "unassigned"}/${Date.now()}-${file.name}`;
  const upload = await supabase.storage.from(DOCUMENT_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false
  });

  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
  }

  const documentRecord: Database["public"]["Tables"]["documents"]["Insert"] = {
    importer_id: importerId,
    document_kind: documentKind,
    title: file.name,
    storage_path: storagePath,
    original_filename: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    sha256,
    linked_entity_type: supplierId ? "foreign_supplier" : null,
    linked_entity_id: supplierId || null,
    uploaded_via: "app"
  };

  const documentsTable = supabase.from("documents") as unknown as DocumentInsertTable;
  const document = await documentsTable.insert(documentRecord);

  if (document.error) {
    return NextResponse.json({ error: document.error.message }, { status: 500 });
  }

  return NextResponse.json({ storagePath });
}
