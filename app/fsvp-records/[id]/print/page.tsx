import { notFound } from "next/navigation";
import { PrintButton } from "@/components/fsvp/PrintButton";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { APP_NAME, PARENT_BRAND } from "@/lib/constants";

export const runtime = "edge";

export default async function FsvpRecordPrintPage({
  params,
}: {
  params: { id: string };
}) {
  const { supabase } = await requireProfileRole("/fsvp-records", [
    "us_importer", "reviewer", "administrator",
  ]);
  const { id } = params;

  const { data: record } = await (supabase.from("fsvp_records") as any)
    .select(`
      id, status, overall_score, hazard_analysis_notes, supplier_evaluation_notes,
      facility_evaluation_notes, verification_determination, approval_decision,
      approved_at, reassessment_due_at, created_at,
      suppliers!inner(company_name, country, fda_registration_number, address_json, contact_json),
      facilities_verify!inner(facility_name, facility_type, fda_registration_number, facility_address_json),
      products_verify!inner(product_name, product_description, country_of_origin, intended_use, allergen_information),
      rule_versions!inner(version_number),
      profiles:approved_by_profile_id(full_name, email)
    `)
    .eq("id", id)
    .maybeSingle();

  if (!record) return notFound();

  const { data: rawAttached } = await (supabase.from("fsvp_record_evidence") as any)
    .select(`
      attached_at, notes,
      documents!inner(title, document_kind, expiration_date, uploaded_at),
      requirement_items(item_name)
    `)
    .eq("fsvp_record_id", id)
    .order("attached_at");

  type AttachedRow = {
    attached_at: string;
    notes: string | null;
    documents: { title: string; document_kind: string; expiration_date: string | null; uploaded_at: string };
    requirement_items: { item_name: string } | null;
  };

  const { data: rawDecisions } = await (supabase.from("approval_decisions") as any)
    .select("decision, decision_notes, conditions_text, decided_at, profiles:decided_by_profile_id(full_name, email)")
    .eq("fsvp_record_id", id)
    .order("decided_at", { ascending: false })
    .limit(1);

  const latestDecision = (rawDecisions ?? [])[0] as {
    decision: string;
    decision_notes: string | null;
    conditions_text: string | null;
    decided_at: string;
    profiles: { full_name: string | null; email: string } | null;
  } | undefined;

  const { data: schedule } = await (supabase.from("reassessment_schedules") as any)
    .select("next_due_at, frequency_months, last_assessed_at")
    .eq("fsvp_record_id", id)
    .maybeSingle();

  const supplier = record.suppliers as { company_name: string; country: string; fda_registration_number: string | null; address_json: Record<string, string>; contact_json: Record<string, string> | null };
  const facility = record.facilities_verify as { facility_name: string; facility_type: string; fda_registration_number: string | null; facility_address_json: Record<string, string> };
  const product = record.products_verify as { product_name: string; product_description: string | null; country_of_origin: string | null; intended_use: string | null; allergen_information: string | null };
  const ruleVer = record.rule_versions as { version_number: number };
  const approver = record.profiles as { full_name: string | null; email: string } | null;
  const attached = (rawAttached ?? []) as AttachedRow[];

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  function statusLabel(s: string) {
    const m: Record<string, string> = {
      importer_approved: "FSVP Approved",
      conditionally_approved: "Conditionally Approved",
      rejected: "Rejected",
      draft: "Draft",
    };
    return m[s] ?? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <>
      {/* Print controls — hidden when printing */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-8 py-3 print:hidden">
        <a href={`/fsvp-records/${id}`} className="text-sm text-slate-500 hover:text-ink">
          ← Back to Record
        </a>
        <PrintButton />
      </div>

      {/* Print-optimized document */}
      <div className="mx-auto max-w-4xl px-8 py-10 font-sans text-sm text-black print:max-w-none print:px-0 print:py-0">

        {/* Cover */}
        <div className="border-b-2 border-black pb-6 mb-8">
          <p className="text-xs uppercase tracking-widest text-slate-500">{PARENT_BRAND}</p>
          <h1 className="mt-2 text-3xl font-bold">{APP_NAME}</h1>
          <h2 className="mt-1 text-xl font-semibold text-slate-700">Inspection-Ready FSVP Package</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-semibold">Record ID:</span> {id}
            </div>
            <div>
              <span className="font-semibold">Generated:</span> {today}
            </div>
            <div>
              <span className="font-semibold">Rule Version:</span> v{ruleVer.version_number}
            </div>
            <div>
              <span className="font-semibold">Status:</span> {statusLabel(record.status)}
            </div>
            {record.overall_score !== null && (
              <div>
                <span className="font-semibold">FSVP Score:</span> {Number(record.overall_score).toFixed(0)} / 100
              </div>
            )}
          </div>
        </div>

        {/* Section helper */}
        {[
          {
            title: "1. Supplier Identification",
            rows: [
              ["Company Name", supplier.company_name],
              ["Country", supplier.country],
              ["FDA Registration", supplier.fda_registration_number ?? "Not provided"],
              ["Contact", supplier.contact_json?.email ?? "—"],
            ],
          },
          {
            title: "2. Facility Identification",
            rows: [
              ["Facility Name", facility.facility_name],
              ["Facility Type", facility.facility_type],
              ["FDA Registration", facility.fda_registration_number ?? "Not provided"],
            ],
          },
          {
            title: "3. Product Identification",
            rows: [
              ["Product Name", product.product_name],
              ["Country of Origin", product.country_of_origin ?? "—"],
              ["Intended Use", product.intended_use?.replace(/_/g, " ") ?? "—"],
              ["Allergen Information", product.allergen_information ?? "None declared"],
            ],
          },
        ].map((section) => (
          <div key={section.title} className="mb-8">
            <h3 className="border-b border-slate-300 pb-1 text-base font-bold">{section.title}</h3>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {section.rows.map(([label, value]) => (
                  <tr key={label} className="border-b border-slate-100">
                    <td className="py-1.5 pr-4 font-semibold text-slate-600 w-48">{label}</td>
                    <td className="py-1.5">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {/* Narrative sections */}
        {[
          { title: "4. Hazard Analysis", content: record.hazard_analysis_notes },
          { title: "5. Supplier Evaluation", content: record.supplier_evaluation_notes },
          { title: "6. Facility Evaluation", content: record.facility_evaluation_notes },
          { title: "7. Verification Determination", content: record.verification_determination },
        ].map((s) => (
          <div key={s.title} className="mb-8">
            <h3 className="border-b border-slate-300 pb-1 text-base font-bold">{s.title}</h3>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed text-slate-800">
              {s.content || <em className="text-slate-400">Not completed.</em>}
            </p>
          </div>
        ))}

        {/* Evidence package */}
        <div className="mb-8">
          <h3 className="border-b border-slate-300 pb-1 text-base font-bold">8. Accepted Evidence Package</h3>
          {attached.length === 0 ? (
            <p className="mt-3 text-slate-400 italic">No evidence documents attached to this record.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300">
                  <th className="pb-1.5 text-left font-semibold">Document</th>
                  <th className="pb-1.5 text-left font-semibold">Category</th>
                  <th className="pb-1.5 text-left font-semibold">Requirement</th>
                  <th className="pb-1.5 text-left font-semibold">Expires</th>
                </tr>
              </thead>
              <tbody>
                {attached.map((doc, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">{doc.documents.title}</td>
                    <td className="py-1.5 pr-3 capitalize">{doc.documents.document_kind.replace(/_/g, " ")}</td>
                    <td className="py-1.5 pr-3">{doc.requirement_items?.item_name ?? "—"}</td>
                    <td className="py-1.5">{doc.documents.expiration_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Approval decision */}
        <div className="mb-8">
          <h3 className="border-b border-slate-300 pb-1 text-base font-bold">9. Importer Approval Decision</h3>
          {latestDecision ? (
            <div className="mt-3 space-y-1 text-sm">
              <div><span className="font-semibold">Decision:</span> {latestDecision.decision.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</div>
              <div><span className="font-semibold">Date:</span> {new Date(latestDecision.decided_at).toLocaleDateString()}</div>
              <div><span className="font-semibold">Decided by:</span> {latestDecision.profiles?.full_name || latestDecision.profiles?.email || "—"}</div>
              {latestDecision.conditions_text && (
                <div><span className="font-semibold">Conditions:</span> {latestDecision.conditions_text}</div>
              )}
              {latestDecision.decision_notes && (
                <div><span className="font-semibold">Notes:</span> {latestDecision.decision_notes}</div>
              )}
            </div>
          ) : (
            <p className="mt-3 italic text-slate-400">No approval decision recorded.</p>
          )}
        </div>

        {/* Reassessment */}
        {schedule && (
          <div className="mb-8">
            <h3 className="border-b border-slate-300 pb-1 text-base font-bold">10. Reassessment Schedule</h3>
            <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
              <div><span className="font-semibold">Frequency:</span> Every {schedule.frequency_months} months</div>
              <div><span className="font-semibold">Last Assessed:</span> {schedule.last_assessed_at ? new Date(schedule.last_assessed_at).toLocaleDateString() : "—"}</div>
              <div><span className="font-semibold">Next Due:</span> {new Date(schedule.next_due_at).toLocaleDateString()}</div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 border-t-2 border-black pt-6 text-xs text-slate-500">
          <p>
            This document was generated by {APP_NAME} on {today}. It constitutes the importer's FSVP record as
            required under 21 CFR Part 1, Subpart L. This document does not constitute FDA certification.
            FDA does not certify suppliers under FSVP.
          </p>
          <p className="mt-2 font-semibold">Record ID: {id} · Rule Version: v{ruleVer.version_number}</p>
        </div>
      </div>
    </>
  );
}
