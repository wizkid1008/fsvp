import { NextResponse } from "next/server";
import { DOCUMENT_BUCKET } from "@/lib/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export const runtime = "edge";

type DocumentInsertResult = {
  data: { id: string } | null;
  error: { message: string } | null;
};

type DocumentInsertTable = {
  insert(values: Database["public"]["Tables"]["documents"]["Insert"]): {
    select(columns: string): {
      single(): Promise<DocumentInsertResult>;
    };
  };
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
  const title = String(formData.get("title") ?? "").trim();
  const documentKind = String(formData.get("document_kind") ?? "unclassified");
  const supplierId = String(formData.get("supplier_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const facilityId = String(formData.get("facility_id") ?? "");
  const linkType = String(formData.get("link_type") ?? "supplier");
  const relatedRequirementId = String(formData.get("related_requirement_id") ?? "");
  const importerId = String(formData.get("importer_id") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file upload is required." }, { status: 400 });
  }

  if (!importerId) {
    return NextResponse.json({ error: "Importer context is required." }, { status: 400 });
  }

  if (!supplierId) {
    return NextResponse.json({ error: "Supplier is required for evidence uploads." }, { status: 400 });
  }

  const supplier = await (supabase.from("suppliers") as any)
    .select("id")
    .eq("id", supplierId)
    .maybeSingle();

  if (supplier.error || !supplier.data) {
    return NextResponse.json({ error: "Select a valid supplier for this evidence." }, { status: 400 });
  }

  let linkedEntityType = "supplier";
  let linkedEntityId = supplierId;
  let linkedProductFacilityId: string | null = null;

  if (linkType === "product") {
    if (!productId) {
      return NextResponse.json({ error: "Product evidence must be linked to a product." }, { status: 400 });
    }

    const product = await (supabase.from("products_verify") as any)
      .select("id, facility_id")
      .eq("id", productId)
      .eq("supplier_id", supplierId)
      .maybeSingle();

    if (product.error || !product.data) {
      return NextResponse.json({ error: "Select a product that belongs to the selected supplier." }, { status: 400 });
    }

    linkedEntityType = "product";
    linkedEntityId = productId;
    linkedProductFacilityId = product.data.facility_id ?? null;
  } else if (linkType === "facility") {
    if (!facilityId) {
      return NextResponse.json({ error: "Facility evidence must be linked to a facility." }, { status: 400 });
    }

    const facility = await (supabase.from("facilities_verify") as any)
      .select("id")
      .eq("id", facilityId)
      .eq("supplier_id", supplierId)
      .maybeSingle();

    if (facility.error || !facility.data) {
      return NextResponse.json({ error: "Select a facility that belongs to the selected supplier." }, { status: 400 });
    }

    linkedEntityType = "facility";
    linkedEntityId = facilityId;
  }

  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const storagePath = `${importerId}/${supplierId}/${Date.now()}-${file.name}`;
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
    title: title || file.name,
    storage_path: storagePath,
    original_filename: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    sha256,
    linked_entity_type: linkedEntityType,
    linked_entity_id: linkedEntityId,
    related_requirement_id: relatedRequirementId || null,
    uploaded_via: "app"
  };

  const documentsTable = supabase.from("documents") as unknown as DocumentInsertTable;
  const document = await documentsTable.insert(documentRecord).select("id").single();

  if (document.error) {
    return NextResponse.json({ error: document.error.message }, { status: 500 });
  }

  if (relatedRequirementId && document.data?.id) {
    await (supabase.from("requirement_evidence") as any).insert({
      importer_id: importerId,
      supplier_id: supplierId,
      product_id: linkedEntityType === "product" ? linkedEntityId : null,
      facility_id: linkedEntityType === "facility" ? linkedEntityId : linkedProductFacilityId,
      requirement_id: relatedRequirementId,
      document_id: document.data.id,
      status: "uploaded"
    });
  }

  const { data: auditSetting } = await (supabase.from("app_settings") as any)
    .select("boolean_value")
    .eq("setting_key", "auto_generate_audit_events")
    .maybeSingle();

  if (auditSetting?.boolean_value !== false && document.data?.id) {
    await (supabase.from("audit_logs") as any).insert({
      importer_id: importerId,
      actor_profile_id: user.id,
      action: "document_uploaded",
      record_type: "documents",
      record_id: document.data.id,
      new_value: {
        title: documentRecord.title,
        document_kind: documentKind,
        linked_entity_type: linkedEntityType,
        linked_entity_id: linkedEntityId,
        related_requirement_id: relatedRequirementId || null
      }
    });
  }

  return NextResponse.json({ storagePath, documentId: document.data?.id });
}
