import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FsvpNarrativeForm } from "@/components/fsvp/FsvpNarrativeForm";
import { ApprovalDecisionForm } from "@/components/fsvp/ApprovalDecisionForm";
import { EvidencePackagePanel } from "@/components/fsvp/EvidencePackagePanel";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

function statusTone(status: string): StatusTone {
  if (status === "importer_approved") return "success";
  if (status === "conditionally_approved") return "warning";
  if (status === "rejected") return "danger";
  if (status === "draft") return "neutral";
  return "info";
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    draft: "Draft",
    awaiting_supplier_evidence: "Awaiting Evidence",
    supplier_evidence_submitted: "Evidence Submitted",
    supplier_evidence_accepted: "Evidence Accepted",
    importer_review_pending: "Review Pending",
    importer_approved: "FSVP Approved",
    conditionally_approved: "Conditionally Approved",
    needs_corrective_action: "Needs Corrective Action",
    rejected: "Rejected",
    expired: "Expired",
    reassessment_due: "Reassessment Due",
  };
  return map[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function FsvpRecordPage({
  params,
}: {
  params: { id: string };
}) {
  const { supabase, role } = await requireProfileRole("/fsvp-records", [
    "us_importer", "reviewer", "administrator",
  ]);
  const { id } = params;

  const { data: record } = await (supabase.from("fsvp_records") as any)
    .select(`
      id, status, overall_score, hazard_analysis_notes, supplier_evaluation_notes,
      facility_evaluation_notes, verification_determination, approval_decision,
      approved_at, reassessment_due_at, created_at,
      suppliers!inner(id, company_name, country, fda_registration_number, contact_json),
      facilities_verify!inner(id, facility_name, facility_type, fda_registration_number, facility_address_json),
      products_verify!inner(id, product_name, product_description, country_of_origin, intended_use, allergen_information),
      rule_versions!inner(id, version_number, status)
    `)
    .eq("id", id)
    .maybeSingle();

  if (!record) return notFound();

  type Supplier = { id: string; company_name: string; country: string; fda_registration_number: string | null; contact_json: Record<string, string> | null };
  type Facility = { id: string; facility_name: string; facility_type: string; fda_registration_number: string | null; facility_address_json: Record<string, string> };
  type Product = { id: string; product_name: string; product_description: string | null; country_of_origin: string | null; intended_use: string | null; allergen_information: string | null };
  type RuleVer = { id: string; version_number: number; status: string };

  const supplier = record.suppliers as Supplier;
  const facility = record.facilities_verify as Facility;
  const product = record.products_verify as Product;
  const ruleVersion = record.rule_versions as RuleVer;

  const isImporter = role === "us_importer" || role === "administrator";
  const isEditable = isImporter && !["importer_approved", "rejected"].includes(record.status);

  // Fetch attached evidence
  const { data: rawAttached } = await (supabase.from("fsvp_record_evidence") as any)
    .select(`
      id, document_id, attached_at, notes,
      documents!inner(title, document_kind),
      requirement_items(item_name)
    `)
    .eq("fsvp_record_id", id)
    .order("attached_at");

  type AttachedRow = {
    id: string;
    document_id: string;
    attached_at: string;
    notes: string | null;
    documents: { title: string; document_kind: string };
    requirement_items: { item_name: string } | null;
  };

  const attachedDocs = ((rawAttached ?? []) as AttachedRow[]).map((r) => ({
    id: r.id,
    document_id: r.document_id,
    title: r.documents.title,
    document_kind: r.documents.document_kind,
    requirement_item_name: r.requirement_items?.item_name ?? null,
    attached_at: r.attached_at,
    notes: r.notes,
  }));

  // Fetch all accepted documents for this supplier (available to attach)
  const { data: rawAvailable } = await (supabase.from("documents") as any)
    .select(`id, title, document_kind, requirement_item_id, expiration_date`)
    .eq("supplier_id", supplier.id)
    .eq("evidence_status", "accepted")
    .is("soft_deleted_at", null)
    .order("title");

  type AvailableRow = {
    id: string;
    title: string;
    document_kind: string;
    requirement_item_id: string | null;
    expiration_date: string | null;
  };

  const availableDocIds = new Set(attachedDocs.map((d) => d.document_id));

  // Fetch requirement item names for available docs
  const itemIds = [...new Set(
    ((rawAvailable ?? []) as AvailableRow[])
      .map((d) => d.requirement_item_id)
      .filter(Boolean) as string[]
  )];

  const { data: rawItems } = itemIds.length > 0
    ? await (supabase.from("requirement_items") as any)
        .select("id, item_name")
        .in("id", itemIds)
    : { data: [] };

  const itemNameMap = new Map(
    ((rawItems ?? []) as Array<{ id: string; item_name: string }>).map((i) => [i.id, i.item_name])
  );

  const availableDocs = ((rawAvailable ?? []) as AvailableRow[]).map((d) => ({
    id: d.id,
    title: d.title,
    document_kind: d.document_kind,
    requirement_item_name: d.requirement_item_id ? itemNameMap.get(d.requirement_item_id) ?? null : null,
    expiration_date: d.expiration_date,
  }));

  // Fetch open corrective actions for this supplier
  const { data: rawCAs } = await (supabase.from("corrective_actions") as any)
    .select("id, issue_description, status, triggered_at")
    .eq("supplier_id", supplier.id)
    .in("status", ["open", "in_progress"])
    .order("triggered_at", { ascending: false })
    .limit(5);

  type CA = { id: string; issue_description: string; status: string; triggered_at: string };
  const corrective_actions = (rawCAs ?? []) as CA[];

  // Fetch reassessment schedule
  const { data: schedule } = await (supabase.from("reassessment_schedules") as any)
    .select("next_due_at, frequency_months, status, last_assessed_at")
    .eq("fsvp_record_id", id)
    .maybeSingle();

  const narrativeSections = [
    {
      field: "hazard_analysis_notes",
      label: "Hazard Analysis",
      description: "Document known or reasonably foreseeable biological, chemical, and physical hazards for this product.",
      value: record.hazard_analysis_notes,
    },
    {
      field: "supplier_evaluation_notes",
      label: "Supplier Evaluation",
      description: "Summarize your evaluation of the supplier's food safety controls and performance.",
      value: record.supplier_evaluation_notes,
    },
    {
      field: "facility_evaluation_notes",
      label: "Facility Evaluation",
      description: "Document your assessment of the facility's food safety management and GMP compliance.",
      value: record.facility_evaluation_notes,
    },
    {
      field: "verification_determination",
      label: "Verification Determination",
      description: "Describe the verification activities used and your determination that they are adequate.",
      value: record.verification_determination,
    },
  ];

  const overdue = record.reassessment_due_at && new Date(record.reassessment_due_at) <= new Date();

  return (
    <AppShell role={role}>
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/fsvp-records" className="hover:text-ink">FSVP Records</Link>
            <span className="text-slate-300">/</span>
            <span className="text-slate-700 font-medium truncate max-w-xs">{supplier.company_name}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">
              {product.product_name}
            </h1>
            <StatusBadge tone={statusTone(record.status)}>
              {statusLabel(record.status)}
            </StatusBadge>
            {overdue && <StatusBadge tone="danger">Reassessment Overdue</StatusBadge>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {supplier.company_name} · {facility.facility_name} · Rule v{ruleVersion.version_number}
          </p>
          {record.approved_at && (
            <p className="mt-1 text-xs text-slate-400">
              Approved {new Date(record.approved_at).toLocaleDateString()}
              {record.reassessment_due_at && ` · Reassessment due ${new Date(record.reassessment_due_at).toLocaleDateString()}`}
            </p>
          )}
        </div>
        {record.overall_score !== null && (
          <div className="rounded-lg border border-line bg-white px-6 py-4 text-center shadow-soft shrink-0">
            <p className="text-xs font-medium text-slate-500">FSVP Score</p>
            <p className={`mt-1 text-4xl font-semibold ${
              record.overall_score >= 90 ? "text-emerald-600" :
              record.overall_score >= 75 ? "text-amber-600" :
              record.overall_score >= 60 ? "text-orange-600" : "text-red-600"
            }`}>
              {record.overall_score.toFixed(0)}
            </p>
            <p className="text-xs text-slate-400">out of 100</p>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-6">

        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Supplier",
              lines: [
                supplier.company_name,
                supplier.country,
                supplier.fda_registration_number ? `FDA: ${supplier.fda_registration_number}` : null,
              ],
            },
            {
              title: "Facility",
              lines: [
                facility.facility_name,
                facility.facility_type,
                facility.fda_registration_number ? `FDA Reg: ${facility.fda_registration_number}` : null,
              ],
            },
            {
              title: "Product",
              lines: [
                product.product_name,
                product.country_of_origin ?? null,
                product.intended_use ? `Use: ${product.intended_use.replace(/_/g, " ")}` : null,
                product.allergen_information ? `Allergens: ${product.allergen_information}` : null,
              ],
            },
          ].map((card) => (
            <div key={card.title} className="rounded-lg border border-line bg-white p-4 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.title}</p>
              <div className="mt-2 space-y-0.5">
                {card.lines.filter(Boolean).map((line, i) => (
                  <p key={i} className={`text-sm ${i === 0 ? "font-semibold text-ink" : "text-slate-600"}`}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Narrative sections */}
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="mb-5 border-b border-line pb-4">
            <h2 className="text-base font-semibold text-ink">Importer FSVP Documentation</h2>
            <p className="mt-1 text-sm text-slate-500">
              These sections are owned by the importer and must be completed before making an approval decision.
            </p>
          </div>
          <FsvpNarrativeForm
            recordId={id}
            sections={narrativeSections}
            readonly={!isEditable}
          />
        </section>

        {/* Evidence package */}
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="mb-5 border-b border-line pb-4">
            <h2 className="text-base font-semibold text-ink">Evidence Package</h2>
            <p className="mt-1 text-sm text-slate-500">
              Accepted documents from this supplier that support this FSVP record.
              Only accepted documents can be attached.
            </p>
          </div>
          <EvidencePackagePanel
            recordId={id}
            attachedDocs={attachedDocs}
            availableDocs={availableDocs}
            readonly={!isEditable}
          />
        </section>

        {/* Corrective actions */}
        {corrective_actions.length > 0 && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-sm font-semibold text-amber-900">
              Open Corrective Actions ({corrective_actions.length})
            </h2>
            <div className="mt-3 space-y-2">
              {corrective_actions.map((ca) => (
                <div key={ca.id} className="flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-white px-3 py-2">
                  <p className="text-sm text-ink">{ca.issue_description}</p>
                  <StatusBadge tone={ca.status === "open" ? "danger" : "warning"}>
                    {ca.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Reassessment schedule */}
        {schedule && (
          <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <h2 className="text-base font-semibold text-ink">Reassessment Schedule</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-3 text-sm">
              <div>
                <p className="text-xs font-medium text-slate-500">Frequency</p>
                <p className="mt-1 font-semibold text-ink">Every {schedule.frequency_months} months</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Last Assessed</p>
                <p className="mt-1 font-semibold text-ink">
                  {schedule.last_assessed_at ? new Date(schedule.last_assessed_at).toLocaleDateString() : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Next Due</p>
                <p className={`mt-1 font-semibold ${new Date(schedule.next_due_at) <= new Date() ? "text-red-600" : "text-ink"}`}>
                  {new Date(schedule.next_due_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Approval decision */}
        {isImporter && (
          <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <div className="mb-5 border-b border-line pb-4">
              <h2 className="text-base font-semibold text-ink">Approval Decision</h2>
              <p className="mt-1 text-sm text-slate-500">
                Record your importer approval decision. This is locked to the current rule version.
              </p>
            </div>
            <ApprovalDecisionForm
              recordId={id}
              currentDecision={record.status}
            />
          </section>
        )}

      </div>
    </AppShell>
  );
}
