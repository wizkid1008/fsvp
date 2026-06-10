import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { MyEvidenceTable, type EvidenceRow } from "@/components/evidence/MyEvidenceTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { getSupplierType } from "@/lib/supplier-context";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { FileArchive } from "lucide-react";

export const runtime = "edge";

export default async function MyEvidencePage() {
  const { role, user } = await requireProfileRole("/my-evidence", ["supplier", "administrator"]);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id")
    .eq("id", user.id)
    .maybeSingle();

  const supplierId = (profile?.supplier_id as string | null) ?? "";

  const docsQuery = (supabase.from("documents") as any)
    .select("id, title, original_filename, document_kind, linked_entity_type, uploaded_at, evidence_status, review_notes, expiration_date")
    .is("soft_deleted_at", null)
    .order("uploaded_at", { ascending: false });

  const { data: rawDocs } = supplierId
    ? await docsQuery.eq("supplier_id", supplierId)
    : await docsQuery.eq("uploaded_by_profile_id", user.id);

  const documents    = (rawDocs ?? []) as EvidenceRow[];
  const supplierType = await getSupplierType(supabase as any, supplierId || null);

  return (
    <AppShell role={role} supplierType={supplierType}>
      <SectionHeader
        title="My Evidence"
        description="All documents you have submitted. Upload evidence directly from the Corporate, Facilities, or Products pages."
      />

      <div className="mt-6">
        {documents.length === 0 ? (
          <EmptyState
            icon={FileArchive}
            title="No documents uploaded yet"
            description="Upload evidence from the Corporate, Facilities, or Products pages. Documents will appear here once submitted."
          />
        ) : (
          <MyEvidenceTable rows={documents} />
        )}
      </div>
    </AppShell>
  );
}
