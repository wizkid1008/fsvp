import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { EvidenceUploadPanel } from "@/components/evidence/EvidenceUploadPanel";
import { SectionProgressBar } from "@/components/evidence/SectionProgressBar";
import type { SectionProgress } from "@/components/evidence/SectionProgressBar";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { FileArchive } from "lucide-react";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function evidenceTone(status: string | null): StatusTone {
  if (status === "accepted") return "success";
  if (status === "under_review") return "info";
  if (status === "needs_revision" || status === "rejected") return "danger";
  if (status === "submitted") return "warning";
  return "neutral";
}

function evidenceLabel(status: string | null): string {
  if (!status || status === "not_submitted") return "Not Submitted";
  const map: Record<string, string> = {
    submitted: "Submitted",
    under_review: "Under Review",
    accepted: "Accepted",
    needs_revision: "Needs Revision",
    rejected: "Rejected",
    expired: "Expired",
  };
  return map[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function MyEvidencePage() {
  const { role, user } = await requireProfileRole("/my-evidence", ["supplier", "administrator"]);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const supplierId = (profile?.supplier_id as string | null) ?? "";

  // Fetch documents for this supplier
  const docsQuery = (supabase.from("documents") as any)
    .select("id, title, document_kind, original_filename, uploaded_at, evidence_status, review_notes, requirement_item_id, linked_entity_type, facility_id, expiration_date")
    .is("soft_deleted_at", null)
    .order("uploaded_at", { ascending: false });

  const filteredDocsQuery = supplierId
    ? docsQuery.eq("supplier_id", supplierId)
    : docsQuery.eq("uploaded_by_profile_id", user.id);

  const [docsRes, suppliersRes, productsRes, facilitiesRes, facilityAccessRes, categoriesRes, pubVersionRes] = await Promise.all([
    filteredDocsQuery,
    supplierId
      ? (supabase.from("suppliers") as any).select("id, company_name").eq("id", supplierId)
      : (supabase.from("suppliers") as any).select("id, company_name").order("company_name"),
    supplierId
      ? (supabase.from("products_verify") as any).select("id, product_name, supplier_id, facility_id").eq("supplier_id", supplierId).order("product_name")
      : (supabase.from("products_verify") as any).select("id, product_name, supplier_id, facility_id").order("product_name"),
    (supabase.from("facilities_verify") as any).select("id, facility_name, supplier_id").order("facility_name"),
    supplierId
      ? (supabase.from("facility_supplier_access") as any).select("facility_id, supplier_id").eq("supplier_id", supplierId)
      : (supabase.from("facility_supplier_access") as any).select("facility_id, supplier_id"),
    (supabase.from("document_categories") as any).select("label").eq("active", true).order("sort_order"),
    (supabase.from("rule_versions") as any).select("id").eq("status", "published").order("version_number", { ascending: false }).limit(1).maybeSingle(),
  ]);

  type DocRow = {
    id: string; title: string; document_kind: string; original_filename: string | null;
    uploaded_at: string; evidence_status: string | null; review_notes: string | null;
    requirement_item_id: string | null; linked_entity_type: string | null;
    facility_id: string | null; expiration_date: string | null;
  };

  const documents = (docsRes.data ?? []) as DocRow[];
  const suppliers = (suppliersRes.data ?? []) as Array<{ id: string; company_name: string }>;
  const products = (productsRes.data ?? []) as Array<{ id: string; product_name: string; supplier_id: string | null; facility_id: string | null }>;

  const accessByFacility = new Map<string, string[]>();
  for (const a of (facilityAccessRes.data ?? []) as Array<{ facility_id: string; supplier_id: string }>) {
    const ex = accessByFacility.get(a.facility_id) ?? [];
    ex.push(a.supplier_id);
    accessByFacility.set(a.facility_id, ex);
  }
  const facilities = ((facilitiesRes.data ?? []) as Array<{ id: string; facility_name: string; supplier_id: string | null }>)
    .map((f) => ({ ...f, supplier_ids: accessByFacility.get(f.id) ?? (f.supplier_id ? [f.supplier_id] : []) }))
    .filter((f) => !supplierId || f.supplier_ids.includes(supplierId));

  const documentCategories = ((categoriesRes.data ?? []) as Array<{ label: string }>).map((c) => c.label);
  const pubVersion = pubVersionRes.data as { id: string } | null;

  let sectionProgress: SectionProgress[] = [];
  let requirementItems: Array<{ id: string; item_name: string; section_name: string }> = [];

  if (pubVersion?.id) {
    const { data: rawSections } = await (supabase.from("requirement_sections") as any)
      .select("id, section_key, section_name, applies_to, sort_order")
      .eq("rule_version_id", pubVersion.id)
      .order("sort_order");

    const sectionIds = (rawSections ?? []).map((s: { id: string }) => s.id);
    const { data: rawWeights } = await (supabase.from("scoring_category_weights") as any)
      .select("section_id, weight_percent")
      .eq("rule_version_id", pubVersion.id);

    const { data: rawItems } = sectionIds.length > 0
      ? await (supabase.from("requirement_items") as any)
          .select("id, section_id, item_name, is_required, is_critical_blocker")
          .in("section_id", sectionIds)
          .eq("is_required", true)
      : { data: [] };

    // Build requirementItems for upload panel
    const sectionNameMap = new Map(
      ((rawSections ?? []) as Array<{ id: string; section_name: string }>).map((s) => [s.id, s.section_name])
    );
    requirementItems = ((rawItems ?? []) as Array<{ id: string; section_id: string; item_name: string }>)
      .map((i) => ({ id: i.id, item_name: i.item_name, section_name: sectionNameMap.get(i.section_id) ?? "" }));

    const weightMap = new Map(
      ((rawWeights ?? []) as Array<{ section_id: string; weight_percent: number }>)
        .map((w) => [w.section_id, Number(w.weight_percent)])
    );

    const itemsBySection = new Map<string, Array<{ id: string; is_critical_blocker: boolean }>>();
    for (const item of (rawItems ?? []) as Array<{ id: string; section_id: string; is_critical_blocker: boolean }>) {
      const arr = itemsBySection.get(item.section_id) ?? [];
      arr.push(item);
      itemsBySection.set(item.section_id, arr);
    }

    // Map document requirement_item_id → evidence_status
    const docByItemId = new Map<string, string[]>();
    for (const doc of documents) {
      if (!doc.requirement_item_id) continue;
      const arr = docByItemId.get(doc.requirement_item_id) ?? [];
      arr.push(doc.evidence_status ?? "not_submitted");
      docByItemId.set(doc.requirement_item_id, arr);
    }

    function bestStatus(statuses: string[]): string {
      if (statuses.includes("accepted")) return "accepted";
      if (statuses.includes("under_review")) return "under_review";
      if (statuses.includes("submitted")) return "submitted";
      if (statuses.includes("needs_revision")) return "needs_revision";
      if (statuses.includes("rejected")) return "rejected";
      return "not_submitted";
    }

    sectionProgress = ((rawSections ?? []) as Array<{ id: string; section_key: string; section_name: string; applies_to: string; sort_order: number }>)
      .map((section) => {
        const items = itemsBySection.get(section.id) ?? [];
        let accepted = 0, submitted = 0, under_review = 0, needs_revision = 0, missing = 0;
        let has_critical_blocker = false;

        for (const item of items) {
          const statuses = docByItemId.get(item.id) ?? [];
          const status = bestStatus(statuses);
          if (status === "accepted") accepted++;
          else if (status === "under_review") under_review++;
          else if (status === "submitted") submitted++;
          else if (status === "needs_revision") needs_revision++;
          else missing++;

          if (item.is_critical_blocker && status !== "accepted") {
            has_critical_blocker = true;
          }
        }

        return {
          section_key: section.section_key,
          section_name: section.section_name,
          applies_to: section.applies_to,
          weight_percent: weightMap.get(section.id) ?? 0,
          required_count: items.length,
          accepted_count: accepted,
          submitted_count: submitted,
          under_review_count: under_review,
          needs_revision_count: needs_revision,
          missing_count: missing,
          has_critical_blocker,
        } satisfies SectionProgress;
      });
  }

  const needsRevision = documents.filter((d) => d.evidence_status === "needs_revision");
  const pendingReview = documents.filter((d) => d.evidence_status === "submitted" || d.evidence_status === "under_review");

  return (
    <AppShell role={role}>
      <SectionHeader
        title="My Evidence"
        description="Upload and track your FSVP evidence submissions. Track which requirements you have met and what still needs to be submitted."
      />

      <div className="mt-6 space-y-6">

        {/* Action items banner */}
        {needsRevision.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-sm font-semibold text-amber-900">
              {needsRevision.length} document{needsRevision.length !== 1 ? "s" : ""} need revision
            </p>
            <ul className="mt-2 space-y-1">
              {needsRevision.map((d) => (
                <li key={d.id} className="text-sm text-amber-800">
                  <span className="font-medium">{d.title}</span>
                  {d.review_notes && <span className="text-amber-700"> — {d.review_notes}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Upload panel */}
        <EvidenceUploadPanel
          documentCategories={documentCategories.length > 0 ? documentCategories : undefined}
          facilities={facilities}
          products={products}
          requirements={[]}
          requirementItems={requirementItems}
          suppliers={suppliers}
        />

        {/* Section progress */}
        {sectionProgress.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-ink">Readiness Progress</h2>
            <p className="mt-1 text-sm text-slate-500">
              Progress is based on the published FSVP rule version. Evidence must be accepted by a reviewer to count.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {sectionProgress.map((s) => (
                <SectionProgressBar key={s.section_key} section={s} />
              ))}
            </div>
          </section>
        )}

        {/* Documents table */}
        {documents.length === 0 ? (
          <EmptyState
            icon={FileArchive}
            title="No documents uploaded yet"
            description="Upload your evidence documents here: certificates of analysis, audit reports, food safety plans, and any other materials requested."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
            <div className="flex items-center justify-between border-b border-line bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">Your Submitted Documents</h3>
              <span className="text-xs text-slate-500">
                {pendingReview.length} awaiting review
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Document</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Category</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Linked To</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Submitted</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {documents.map((doc) => (
                  <tr key={doc.id} className={`hover:bg-slate-50 transition-colors ${doc.evidence_status === "needs_revision" ? "bg-amber-50/40" : ""}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{doc.title}</p>
                      {doc.original_filename && <p className="text-xs text-slate-400">{doc.original_filename}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{doc.document_kind.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-slate-600 capitalize text-xs">
                      {doc.linked_entity_type?.replace(/_/g, " ") ?? "Supplier-wide"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{new Date(doc.uploaded_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={evidenceTone(doc.evidence_status)}>
                        {evidenceLabel(doc.evidence_status)}
                      </StatusBadge>
                      {doc.expiration_date && (
                        <p className="mt-1 text-xs text-slate-400">Exp: {doc.expiration_date}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-xs">
                      {doc.review_notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
