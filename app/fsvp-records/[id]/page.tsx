import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FsvpNarrativeForm } from "@/components/fsvp/FsvpNarrativeForm";
import { ApprovalDecisionForm } from "@/components/fsvp/ApprovalDecisionForm";
import { EvidencePackagePanel } from "@/components/fsvp/EvidencePackagePanel";
import { HazardAnalysisPanel } from "@/components/fsvp/HazardAnalysisPanel";
import { VerificationRecordsPanel } from "@/components/fsvp/VerificationRecordsPanel";
import { PrintButton } from "@/components/fsvp/PrintButton";
import { InspectionPackageButton } from "@/components/fsvp/InspectionPackageButton";
import { ReassessmentSection } from "@/components/fsvp/ReassessmentSection";
import { QiAttestationPanel, type SignedAttestation } from "@/components/fsvp/QiAttestationPanel";
import {
  ComplianceControlsPanel,
  SuspensionBanner,
  type AssuranceView,
} from "@/components/fsvp/ComplianceControlsPanel";
import { evaluateGates } from "@/lib/fsvp/gates";
import { evaluateAttestations, hashAttestationContent } from "@/lib/fsvp/qi-attestation";
import { basisSpec, fetchDetermination, isDeterminationLive, OUTCOME_LABEL } from "@/lib/fsvp/applicability";
import { isActiveOn } from "@/lib/fsvp/qualified-individuals";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
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
  const { supabase, user, role, realRole } = await requireProfileRole("/fsvp-records", [
    "us_importer", "reviewer", "administrator",
  ]);
  const { id } = params;

  const { data: record } = await (supabase.from("fsvp_records") as any)
    .select(`
      id, status, overall_score, importer_id, hazard_analysis_notes, supplier_evaluation_notes,
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

  // Fetch hazard analysis (latest non-superseded)
  const { data: rawHazardAnalysis } = await (supabase.from("fsvp_plan_hazard_analyses") as any)
    .select(`
      id, version, status, methodology_notes, relied_on_other_party,
      relied_on_party_name, performed_by_name, performed_at, next_reassessment_due_at,
      requires_supplier_verification,
      fsvp_plan_hazard_items(
        id, hazard_type, hazard_name, requires_control, severity,
        is_sahcodha, controlling_entity, controls_description
      )
    `)
    .eq("fsvp_record_id", id)
    .neq("status", "superseded")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hazardAnalysis = rawHazardAnalysis
    ? { ...rawHazardAnalysis, items: rawHazardAnalysis.fsvp_plan_hazard_items ?? [] }
    : null;

  // Fetch verification records
  const { data: rawVerificationRecords } = await (supabase.from("fsvp_verification_records") as any)
    .select(`
      id, activity_type, status, scheduled_date, completed_at,
      result, result_notes, is_sahcodha_audit, performed_by_name, next_due_at
    `)
    .eq("fsvp_record_id", id)
    .order("scheduled_date", { ascending: false });

  const verificationRecords = (rawVerificationRecords ?? []) as Array<{
    id: string; activity_type: string; status: string;
    scheduled_date: string | null; completed_at: string | null;
    result: string | null; result_notes: string | null;
    is_sahcodha_audit: boolean; performed_by_name: string | null; next_due_at: string | null;
  }>;

  // Fetch reassessment schedule
  const { data: schedule } = await (supabase.from("reassessment_schedules") as any)
    .select("next_due_at, frequency_months, status, last_assessed_at")
    .eq("fsvp_record_id", id)
    .maybeSingle();

  // ── § 1.503 qualified individual coverage ────────────────────────────────
  // Read through the admin client because signer names live on profiles, whose
  // RLS exposes only the caller's own row.
  const admin = createAdminSupabaseClient();

  type AttestationRow = {
    id: string;
    attestation_type: string;
    statement: string;
    content_hash: string;
    signed_at: string;
    signed_by_profile_id: string;
    revoked_at: string | null;
    revoked_reason: string | null;
    qualified_individuals: { qualification_basis: string } | null;
  };

  const { data: rawAttestations } = await (admin.from("qi_attestations") as any)
    .select(`
      id, attestation_type, statement, content_hash, signed_at,
      signed_by_profile_id, revoked_at, revoked_reason,
      qualified_individuals(qualification_basis)
    `)
    .eq("fsvp_record_id", id)
    .order("signed_at", { ascending: false });

  const attestationRows = (rawAttestations ?? []) as AttestationRow[];

  // How FSVP applies to this food governs what has to be signed — see
  // requiredTypesFor in lib/fsvp/qi-attestation.ts.
  const determination = await fetchDetermination(
    admin, record.importer_id, supplier.id, product.id
  );
  const determinationLive = determination ? isDeterminationLive(determination) : false;
  const determinationSpec = determination ? basisSpec(determination.basis) : null;

  const attestationEval = await evaluateAttestations(
    record,
    attestationRows as any,
    determinationLive ? determination!.outcome : null
  );

  const applicabilityBlock = !determination
    ? "Nobody has determined whether FSVP applies to this food. A qualified individual must do that before the record can be approved."
    : !determinationLive
    ? `The applicability determination for this food expired on ${determination.expires_at}. A qualified individual must make a current one.`
    : null;

  const signerIds = [...new Set(attestationRows.map((a) => a.signed_by_profile_id))];
  const { data: rawSigners } = signerIds.length > 0
    ? await (admin.from("profiles") as any).select("id, full_name, email").in("id", signerIds)
    : { data: [] };
  const signerName = new Map(
    ((rawSigners ?? []) as Array<{ id: string; full_name: string | null; email: string }>)
      .map((p) => [p.id, p.full_name ?? p.email])
  );

  // Which signature still matches the text it was made against.
  const liveHash: Record<string, string> = {
    hazard_analysis:            await hashAttestationContent(record.hazard_analysis_notes),
    supplier_evaluation:        await hashAttestationContent(record.supplier_evaluation_notes),
    verification_determination: await hashAttestationContent(record.verification_determination),
  };

  const attestations: SignedAttestation[] = attestationRows.map((a) => ({
    id:                  a.id,
    attestation_type:    a.attestation_type,
    statement:           a.statement,
    signed_at:           a.signed_at,
    signer_name:         signerName.get(a.signed_by_profile_id) ?? "Unknown",
    qualification_basis: a.qualified_individuals?.qualification_basis ?? "",
    revoked_at:          a.revoked_at,
    revoked_reason:      a.revoked_reason,
    current:             a.revoked_at === null && liveHash[a.attestation_type] === a.content_hash,
  }));

  const { data: viewerQi } = await (admin.from("qualified_individuals") as any)
    .select("id, active_from, active_to")
    .eq("profile_id", user.id)
    .eq("importer_id", record.importer_id)
    .maybeSingle();

  const viewerIsActiveQi = Boolean(viewerQi && isActiveOn(viewerQi));

  // The blocking conditions added by migration 010: suspension, the § 1.506(d)
  // determination and § 1.507 assurances. Evaluated with the same function the
  // approve route uses, so the page cannot promise an approval the API refuses.
  const gateBlocks = await evaluateGates(admin, {
    importerId:   record.importer_id,
    supplierId:   supplier.id,
    fsvpRecordId: id,
    outcome:      determinationLive ? determination!.outcome : null,
  });

  const [{ data: verificationDetermination }, { data: rawAssurances }, { data: liveSuspension }] =
    await Promise.all([
      (admin.from("verification_determinations") as any)
        .select(
          "id, activities, frequency_notes, sahcodha_hazard_present, controlled_by_foreign_supplier, " +
          "annual_onsite_audit_performed, alternative_justification, determined_at"
        )
        .eq("fsvp_record_id", id)
        .is("superseded_at", null)
        .maybeSingle(),

      (admin.from("written_assurances") as any)
        .select("id, category, citation, counterparty_name, food_scope, expires_at")
        .eq("fsvp_record_id", id)
        .is("superseded_at", null)
        .order("expires_at"),

      (admin.from("supplier_suspensions") as any)
        .select("basis, reason")
        .eq("importer_id", record.importer_id)
        .eq("supplier_id", supplier.id)
        .is("lifted_at", null)
        .maybeSingle(),
    ]);

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
    <AppShell role={role} realRole={realRole}>
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
        <div className="flex shrink-0 flex-col items-end gap-3">
          {record.overall_score !== null && (
            <div className="rounded-lg border border-line bg-white px-6 py-4 text-center shadow-soft">
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
          <div className="flex gap-2">
            <Link
              href={`/fsvp-records/${id}/print`}
              target="_blank"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open Print View
            </Link>
            <PrintButton />
            {isImporter && <InspectionPackageButton recordId={id} />}
          </div>
        </div>
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

        {/* Hazard Analysis */}
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="mb-5 border-b border-line pb-4">
            <h2 className="text-base font-semibold text-ink">Hazard Analysis</h2>
            <p className="mt-1 text-sm text-slate-500">
              Identify known or reasonably foreseeable biological, chemical, physical, and radiological hazards per § 1.504.
            </p>
          </div>
          <HazardAnalysisPanel
            recordId={id}
            analysis={hazardAnalysis}
            readonly={!isEditable}
          />
        </section>

        {/* Verification Records */}
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="mb-5 border-b border-line pb-4">
            <h2 className="text-base font-semibold text-ink">Verification Activities</h2>
            <p className="mt-1 text-sm text-slate-500">
              Audits, sampling & testing, records reviews, and certificates of conformance per §§ 1.506–1.507.
            </p>
          </div>
          <VerificationRecordsPanel
            recordId={id}
            records={verificationRecords}
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

        {/* Suspension is the loudest state a record can be in: nothing about it
            can be approved while it holds, so it sits above everything else. */}
        {liveSuspension && (
          <SuspensionBanner basis={liveSuspension.basis} reason={liveSuspension.reason} />
        )}

        {/* Applicability */}
        <section className={`rounded-lg border p-5 shadow-soft ${
          applicabilityBlock ? "border-amber-200 bg-amber-50" : "border-line bg-white"
        }`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink">How FSVP Applies</h2>
              {applicabilityBlock ? (
                <p className="mt-1 max-w-2xl text-sm text-amber-900">{applicabilityBlock}</p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-slate-700">
                    <span className="font-semibold">{OUTCOME_LABEL[determination!.outcome]}</span>
                    {determinationSpec && <> — {determinationSpec.label}</>}
                    <span className="text-slate-500"> · {determination!.citation}</span>
                  </p>
                  {determination!.outcome === "modified" && (
                    <p className="mt-1 max-w-2xl text-sm text-slate-600">
                      Under {determination!.citation} this record does not require a hazard analysis
                      or a foreign supplier evaluation. The verification activities determination is
                      still required, because the written assurance that replaces them is itself a
                      verification activity.
                    </p>
                  )}
                  {determination!.expires_at && (
                    <p className="mt-1 text-xs text-slate-500">
                      Expires {new Date(determination!.expires_at).toLocaleDateString()}
                    </p>
                  )}
                </>
              )}
            </div>
            <Link
              href="/applicability"
              className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
            >
              {determination ? "Review determination" : "Determine applicability"}
            </Link>
          </div>
        </section>

        {/* Qualified individual attestations */}
        <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <div className="mb-5 border-b border-line pb-4">
            <h2 className="text-base font-semibold text-ink">Qualified Individual Attestations</h2>
            <p className="mt-1 text-sm text-slate-500">
              § 1.503 requires a qualified individual to perform or oversee these determinations, and
              § 1.510(a)(2) requires the record to be signed and dated on completion and on any
              modification.{" "}
              {attestationEval.required.length === 3
                ? "All three must carry a current signature before this record can be approved."
                : `Given how FSVP applies to this food, ${attestationEval.required.length} of the three is required.`}
            </p>
          </div>
          <QiAttestationPanel
            recordId={id}
            state={attestationEval.state}
            attestations={attestations}
            viewerIsActiveQi={viewerIsActiveQi}
            viewerCanManageRegister={isImporter}
          />
        </section>

        {/* § 1.506(d) determination and § 1.507 assurances */}
        <ComplianceControlsPanel
          recordId={id}
          blocks={gateBlocks}
          determination={(verificationDetermination as any) ?? null}
          assurances={(rawAssurances ?? []) as AssuranceView[]}
          canEdit={isImporter}
          viewerIsActiveQi={viewerIsActiveQi}
        />

        {/* Reassessment schedule */}
        <ReassessmentSection fsvpRecordId={id} schedule={schedule} />

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
              blockingReasons={[
                ...(applicabilityBlock ? [applicabilityBlock] : []),
                ...attestationEval.reasons,
                // Suspension, § 1.506(d) and § 1.507 — the same list the approve
                // route refuses on, so the form cannot offer a decision the API
                // will reject.
                ...gateBlocks.map((b) => b.message),
              ]}
            />
          </section>
        )}

      </div>
    </AppShell>
  );
}
