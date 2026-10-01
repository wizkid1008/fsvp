import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { MyEvidenceTable, type EvidenceRow } from "@/components/evidence/MyEvidenceTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { CountCards } from "@/components/ui/CountCards";
import { getSupplierType } from "@/lib/supplier-context";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { documentBucket } from "@/lib/readiness/evidence-standing";
import { FileArchive } from "lucide-react";

export const runtime = "edge";

/**
 * Every document this supplier or exporter has filed, in the same format as
 * their Products and Facilities: count cards that each filter the list.
 *
 * It used to open with an amber "Evidence requests" box and, inside the table,
 * a second box listing the documents needing revision — the same documents
 * twice, neither linking to where they are replaced. The counts filter the
 * table now, and each sent-back or lapsing row links to its checklist.
 */
export default async function MyEvidencePage() {
  const { role, realRole, user } = await requireProfileRole("/my-evidence", ["supplier", "exporter", "administrator"]);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id")
    .eq("id", user.id)
    .maybeSingle();

  const supplierId = resolvePreviewedAccountId(realRole, profile?.supplier_id ?? null) ?? "";

  const docsQuery = (supabase.from("documents") as any)
    .select("id, title, original_filename, document_kind, linked_entity_type, linked_entity_id, uploaded_at, evidence_status, review_notes, expiration_date")
    .is("soft_deleted_at", null)
    .order("uploaded_at", { ascending: false });

  const { data: rawDocs } = supplierId
    ? await docsQuery.eq("supplier_id", supplierId)
    : await docsQuery.eq("uploaded_by_profile_id", user.id);

  const documents = (rawDocs ?? []) as EvidenceRow[];
  const supplierType = await getSupplierType(supabase as any, supplierId || null);

  const count = (bucket: string) => documents.filter((doc) => documentBucket(doc) === bucket).length;

  return (
    <AppShell role={role} realRole={realRole} supplierType={supplierType}>
      <SectionHeader
        title="My Evidence"
        description="Every document you have filed and where it stands with your importers. Upload from Company Overview, Facilities or Products, next to the requirement it answers."
      />

      {documents.length > 0 && (
        <div className="mt-6">
          <CountCards
            cards={[
              { label: "All documents", value: documents.length, href: "/my-evidence" },
              { label: "Sent back to you", value: count("returned"), href: "/my-evidence?status=returned", alarm: true },
              { label: "Awaiting importer review", value: count("awaiting"), href: "/my-evidence?status=awaiting" },
              { label: "Expiring within 60 days", value: count("expiring"), href: "/my-evidence?status=expiring", alarm: true },
              { label: "Accepted", value: count("accepted"), href: "/my-evidence?status=accepted" },
            ]}
          />
        </div>
      )}

      <div className="mt-6">
        {documents.length === 0 ? (
          <EmptyState
            icon={FileArchive}
            title="No documents uploaded yet"
            description="Upload evidence from the Company Overview, Facilities, or Products pages. Documents will appear here once submitted."
          />
        ) : (
          <MyEvidenceTable rows={documents} />
        )}
      </div>
    </AppShell>
  );
}
