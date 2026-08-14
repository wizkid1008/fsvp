import { NextResponse } from "next/server";
import { DOCUMENT_BUCKET, DOCUMENT_UPLOAD_MAX_BYTES, DOCUMENT_UPLOAD_MAX_LABEL } from "@/lib/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvenance } from "@/lib/evidence/provenance";
import { refusePreviewWrite } from "@/lib/auth/preview-guard";
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
  const linkTypeRaw = String(formData.get("link_type") ?? "supplier");
  const ALLOWED_LINK_TYPES = ["importer", "supplier", "product", "facility"] as const;
  type LinkType = typeof ALLOWED_LINK_TYPES[number];
  if (!(ALLOWED_LINK_TYPES as readonly string[]).includes(linkTypeRaw)) {
    return NextResponse.json({ error: "Invalid link_type." }, { status: 400 });
  }
  const linkType = linkTypeRaw as LinkType;
  const requirementItemId = String(formData.get("requirement_item_id") ?? "");
  const expirationDate = String(formData.get("expiration_date") ?? "");
  const importerId = String(formData.get("importer_id") ?? "");
  // Who at the supplier actually provided this document, when the importer is
  // uploading on their behalf.
  const attestedByName = String(formData.get("attested_by_name") ?? "").trim();
  const attestedAt = String(formData.get("attested_at") ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file upload is required." }, { status: 400 });
  }

  if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: `File uploads must be ${DOCUMENT_UPLOAD_MAX_LABEL} or smaller.` }, { status: 400 });
  }

  // Suppliers uploading their own evidence may not have an importer_id
  const { data: uploaderProfile } = await (supabase.from("profiles") as any)
    .select("role, supplier_id, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  // An admin previewing an account has no supplier_id or importer_id of their
  // own, so nothing below would have stopped them: the upload went through and
  // landed as importer_uploaded with the admin recorded as its reviewer.
  const previewRefusal = refusePreviewWrite(uploaderProfile?.role, "upload evidence");
  if (previewRefusal) return previewRefusal;

  let resolvedImporterId: string | null = importerId || uploaderProfile?.importer_id || null;
  const resolvedSupplierId = supplierId || uploaderProfile?.supplier_id || "";

  // A supplier/exporter profile has no importer_id of its own, so their uploads
  // used to land with importer_id = null and never reach any importer. Derive it
  // from the active importer relationship instead. When an exporter serves
  // several importers there is no single right answer, so leave it null — the
  // review queue scopes by relationship and will still find it.
  if (!resolvedImporterId && resolvedSupplierId) {
    const { data: importerLinks } = await (createAdminSupabaseClient().from("supplier_relationships") as any)
      .select("importer_id")
      .eq("relationship_type", "importer_supplier")
      .eq("supplier_id", resolvedSupplierId)
      .in("status", ["active", "pending_invite"]);

    const ids = [...new Set(
      ((importerLinks ?? []) as Array<{ importer_id: string | null }>)
        .map((l) => l.importer_id)
        .filter(Boolean)
    )] as string[];

    if (ids.length === 1) resolvedImporterId = ids[0];
  }

  // Importer-level evidence is the exception: it is ABOUT the importer, not
  // about any foreign supplier. § 1.506(b) written procedures, § 1.503 QI
  // qualifications and § 1.510 records procedures belong to the importing
  // organization itself, and demanding a supplier for them would force a false
  // association — the document would then appear in that exporter's evidence
  // and count toward their readiness.
  if (linkTypeRaw === "importer") {
    if (!resolvedImporterId) {
      return NextResponse.json(
        { error: "Your account is not linked to an importing organization, so it has no records of its own." },
        { status: 403 }
      );
    }
    if (uploaderProfile?.role !== "us_importer" && uploaderProfile?.role !== "administrator") {
      return NextResponse.json(
        { error: "Only the importing organization can file its own FSVP records." },
        { status: 403 }
      );
    }
  } else if (!resolvedSupplierId) {
    return NextResponse.json({ error: "Supplier is required for evidence uploads." }, { status: 400 });
  }

  // Skip the supplier existence check when the uploader IS the supplier uploading
  // their own evidence — the supplier_id came from their own profile so it is valid.
  // The RLS on suppliers can block this read when profiles.supplier_id isn't yet
  // persisted, causing a false "invalid supplier" rejection.
  const uploaderIsOwner =
    uploaderProfile?.role === "supplier" &&
    resolvedSupplierId === (uploaderProfile?.supplier_id || supplierId);

  // No supplier to validate when the document is the importer's own.
  if (linkType !== "importer" && !uploaderIsOwner) {
    const supplier = await (supabase.from("suppliers") as any)
      .select("id")
      .eq("id", resolvedSupplierId)
      .maybeSingle();

    if (supplier.error || !supplier.data) {
      return NextResponse.json({ error: "Select a valid supplier for this evidence." }, { status: 400 });
    }
  }

  let linkedEntityType = "supplier";
  let linkedEntityId = resolvedSupplierId;
  let linkedProductFacilityId: string | null = null;

  if (linkType === "importer") {
    // The importing organization is both the owner and the subject.
    linkedEntityType = "importer";
    linkedEntityId = resolvedImporterId as string;
  } else if (linkType === "product") {
    if (!productId) {
      return NextResponse.json({ error: "Product evidence must be linked to a product." }, { status: 400 });
    }

    const product = await (supabase.from("products_verify") as any)
      .select("id, facility_id")
      .eq("id", productId)
      .eq("supplier_id", resolvedSupplierId)
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

    const facilityAccess = await (supabase.from("facility_supplier_access") as any)
      .select("facility_id")
      .eq("facility_id", facilityId)
      .eq("supplier_id", resolvedSupplierId)
      .maybeSingle();
    const facility = await (supabase.from("facilities_verify") as any)
      .select("id, supplier_id")
      .eq("id", facilityId)
      .maybeSingle();

    if (facility.error || !facility.data || (!facilityAccess.data && facility.data.supplier_id !== resolvedSupplierId)) {
      return NextResponse.json({ error: "Select a facility that is available to the selected supplier." }, { status: 400 });
    }

    linkedEntityType = "facility";
    linkedEntityId = facilityId;
  }

  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const storagePrefix = resolvedImporterId ?? resolvedSupplierId;
  const storagePath = `${storagePrefix}/${resolvedSupplierId}/${Date.now()}-${file.name}`;
  const upload = await supabase.storage.from(DOCUMENT_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false
  });

  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
  }

  // Use admin client for the INSERT so RLS on documents never blocks a legitimate
  // upload. Validation (auth, supplier ownership, file size) has already passed
  // above. The broken profiles.supplier_id FK (pointing at foreign_suppliers instead
  // of suppliers) causes the user-JWT client to fail the RLS check even though the
  // upload is fully valid. This is fixed permanently by migration 028.
  const adminDb = createAdminSupabaseClient();

  // Evidence provenance, and what it implies for the review queue. Shared with
  // the form-submission route so an uploaded questionnaire and a completed one
  // are treated identically — see lib/evidence/provenance.ts for the reasoning.
  const provenance = resolveProvenance({
    uploaderSupplierId: uploaderProfile?.supplier_id,
    targetSupplierId: resolvedSupplierId,
    uploaderProfileId: user.id,
    attestedByName,
    attestedAt,
  });

  const documentRecord: Record<string, unknown> = {
    importer_id: resolvedImporterId,
    supplier_id: resolvedSupplierId || null,
    evidence_source: provenance.evidence_source,
    attested_by_name: provenance.attested_by_name,
    attested_at: provenance.attested_at,
    document_kind: documentKind,
    title: title || file.name,
    storage_path: storagePath,
    original_filename: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    sha256,
    linked_entity_type: linkedEntityType,
    linked_entity_id: linkedEntityId,
    requirement_item_id: requirementItemId || null,
    facility_id: linkType === "facility" ? facilityId || null : linkedProductFacilityId,
    expiration_date: expirationDate || null,
    uploaded_by_profile_id: user.id,
    evidence_status: provenance.evidence_status,
    reviewer_profile_id: provenance.reviewer_profile_id,
    uploaded_via: "app"
  };

  const documentsTable = adminDb.from("documents") as unknown as DocumentInsertTable;
  const document = await documentsTable.insert(documentRecord as any).select("id").single();

  if (document.error) {
    return NextResponse.json({ error: document.error.message }, { status: 500 });
  }

  // The requirement_evidence insert that used to sit here was removed with the
  // legacy model (migration 023). It recorded which requirement a document
  // answered — which documents.requirement_item_id already records, on the row
  // itself, versioned and scoped by entity type.

  const { data: auditSetting } = await (adminDb.from("app_settings") as any)
    .select("boolean_value")
    .eq("setting_key", "auto_generate_audit_events")
    .maybeSingle();

  if (auditSetting?.boolean_value !== false && document.data?.id) {
    await (adminDb.from("audit_logs") as any).insert({
      importer_id: resolvedImporterId,
      actor_profile_id: user.id,
      action: "document_uploaded",
      record_type: "documents",
      record_id: document.data.id,
      new_value: {
        title: documentRecord.title,
        document_kind: documentKind,
        linked_entity_type: linkedEntityType,
        linked_entity_id: linkedEntityId,
        requirement_item_id: requirementItemId || null
      }
    });
  }

  return NextResponse.json({ storagePath, documentId: document.data?.id });
}
