import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { MyEvidenceTable, type EvidenceRow } from "@/components/evidence/MyEvidenceTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { getSupplierType } from "@/lib/supplier-context";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { FileArchive } from "lucide-react";

export const runtime = "edge";

export default async function MyEvidencePage() {
  const { role, realRole, user } = await requireProfileRole("/my-evidence", ["supplier", "exporter", "administrator"]);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id")
    .eq("id", user.id)
    .maybeSingle();

  const supplierId = resolvePreviewedAccountId(realRole, profile?.supplier_id ?? null) ?? "";

  const docsQuery = (supabase.from("documents") as any)
    .select("id, title, original_filename, document_kind, linked_entity_type, uploaded_at, evidence_status, review_notes, expiration_date")
    .is("soft_deleted_at", null)
    .order("uploaded_at", { ascending: false });

  const { data: rawDocs } = supplierId
    ? await docsQuery.eq("supplier_id", supplierId)
    : await docsQuery.eq("uploaded_by_profile_id", user.id);

  const documents    = (rawDocs ?? []) as EvidenceRow[];
  const supplierType = await getSupplierType(supabase as any, supplierId || null);
  const requested = documents.filter((doc) =>
    doc.evidence_status === "needs_revision" ||
    doc.evidence_status === "rejected" ||
    doc.evidence_status === "not_submitted" ||
    (doc.expiration_date && doc.expiration_date <= new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10))
  );

  return (
    <AppShell role={role} realRole={realRole} supplierType={supplierType}>
      <SectionHeader
        title="My Evidence"
        description="All documents you have submitted. Upload evidence directly from the Company Overview, Facilities, or Products pages."
      />

      {requested.length > 0 && (
        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-amber-950">Evidence requests</h2>
              <p className="mt-1 text-sm text-amber-900">
                These are the documents importers are most likely waiting on before they can finish review.
              </p>
            </div>
            <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900">
              {requested.length} task{requested.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-4 divide-y divide-amber-200 rounded-md border border-amber-200 bg-white">
            {requested.slice(0, 5).map((doc) => (
              <div key={doc.id} className="px-4 py-3">
                <p className="text-sm font-semibold text-ink">{doc.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  {doc.evidence_status === "needs_revision"
                    ? doc.review_notes || "Revision requested by the reviewer."
                    : doc.evidence_status === "rejected"
                    ? doc.review_notes || "Rejected; upload a replacement from the relevant page."
                    : doc.expiration_date
                    ? `Expires ${new Date(doc.expiration_date).toLocaleDateString()}; provide a current version.`
                    : "Upload the requested evidence from Company Overview, Facilities, or Products."}
                </p>
              </div>
            ))}
          </div>
        </section>
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

