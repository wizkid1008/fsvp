// POST { report_type, format, fsvp_record_id? }
//
// Generates a CSV or printable HTML report and records it in generated_reports.
//
// Previously every report was broken twice over: the queries joined
// foreign_suppliers and foods, both dropped by migration 034 and the legacy
// cleanup, and generated_reports.export_format only permitted 'pdf'/'excel'
// while this route writes 'csv'/'html'. Neither failure was checked, so the
// route recorded a report row and returned an empty file.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { ATTESTATION_LABEL, hashAttestationContent } from "@/lib/fsvp/qi-attestation";
import { basisSpec, OUTCOME_LABEL } from "@/lib/fsvp/applicability";

export const runtime = "edge";

const ALLOWED_ROLES = new Set(["us_importer", "reviewer", "administrator"]);

type ReportType =
  | "supplier_readiness"
  | "compliance_gap"
  | "document_status"
  | "fsvp_record_package";
type ReportFormat = "csv" | "html";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${(v ?? "").toString().replace(/"/g, '""')}"`;
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}

function toHTML(title: string, headers: string[], rows: string[][], subtitle?: string): string {
  const headerCells = headers
    .map((h) => `<th style="background:#2E4057;color:#fff;padding:8px 12px;text-align:left;font-size:13px;">${esc(h)}</th>`)
    .join("");
  const dataRows = rows
    .map((r, i) => {
      const cells = r
        .map((c) => `<td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #e2e8f0;">${esc(c)}</td>`)
        .join("");
      return `<tr style="background:${i % 2 === 0 ? "#f8fafc" : "#fff"};">${cells}</tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Arial,sans-serif;padding:32px;color:#0f172a;}h1{font-size:20px;margin-bottom:4px;}p{font-size:13px;color:#64748b;margin-bottom:24px;}table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0;}@media print{button{display:none;}}</style>
</head><body>
<h1>${esc(title)}</h1>
<p>${subtitle ? esc(subtitle) + " · " : ""}Generated ${new Date().toLocaleDateString()}</p>
<button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;background:#2E4057;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Print / Save as PDF</button>
<table><thead><tr>${headerCells}</tr></thead><tbody>${dataRows || `<tr><td style="padding:16px;font-size:13px;color:#94a3b8;">No data.</td></tr>`}</tbody></table>
</body></html>`;
}

const SOURCE_LABEL: Record<string, string> = {
  supplier_attested: "Supplier attested",
  importer_uploaded: "Importer provided",
  third_party:       "Third party",
};

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !ALLOWED_ROLES.has(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!profile.importer_id) {
    return NextResponse.json(
      { error: "Your account is not linked to an importer organization." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({})) as {
    report_type?: ReportType;
    format?: ReportFormat;
    fsvp_record_id?: string;
  };
  const { report_type, format } = body;

  if (!report_type || !format) {
    return NextResponse.json({ error: "report_type and format are required" }, { status: 400 });
  }
  if (format !== "csv" && format !== "html") {
    return NextResponse.json({ error: "format must be csv or html" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const importerId = profile.importer_id;

  // Exporters this importer is linked to. Documents uploaded by a supplier may
  // carry no importer_id of their own, so scope by relationship.
  const { data: links } = await (admin.from("supplier_relationships") as any)
    .select("supplier_id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", importerId)
    .in("status", ["active", "pending_invite"]);

  const supplierIds = ((links ?? []) as Array<{ supplier_id: string }>)
    .map((l) => l.supplier_id)
    .filter(Boolean);

  const { data: supplierRows } = supplierIds.length
    ? await (admin.from("suppliers") as any).select("id, company_name, country").in("id", supplierIds)
    : { data: [] };

  const supplierName = new Map(
    ((supplierRows ?? []) as Array<{ id: string; company_name: string }>).map((s) => [s.id, s.company_name])
  );

  let headers: string[] = [];
  let rows: string[][] = [];
  let title = "";
  let subtitle: string | undefined;

  if (report_type === "supplier_readiness") {
    title = "Supplier Readiness Report";
    headers = ["Exporter", "Score (%)", "Status", "Gap Summary", "Created"];

    const { data, error } = await (admin.from("readiness_assessments") as any)
      .select("overall_score, status, gap_summary, created_at, supplier_id")
      .eq("importer_id", importerId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    rows = (data ?? []).map((a: any) => [
      supplierName.get(a.supplier_id) ?? a.supplier_id,
      String(Math.round(Number(a.overall_score))),
      a.status,
      a.gap_summary ?? "",
      new Date(a.created_at).toLocaleDateString(),
    ]);

  } else if (report_type === "compliance_gap") {
    title = "Compliance Gap Register";
    headers = ["Exporter", "Product", "Issue", "Source", "Status", "Opened", "Closed"];

    const { data, error } = await (admin.from("corrective_actions") as any)
      .select("issue_description, triggered_by, status, triggered_at, closed_at, supplier_id, products_verify(product_name)")
      .eq("importer_id", importerId)
      .order("triggered_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    rows = (data ?? []).map((a: any) => [
      supplierName.get(a.supplier_id) ?? "",
      a.products_verify?.product_name ?? "",
      a.issue_description,
      String(a.triggered_by ?? "").replace(/_/g, " "),
      a.status,
      new Date(a.triggered_at).toLocaleDateString(),
      a.closed_at ? new Date(a.closed_at).toLocaleDateString() : "",
    ]);

  } else if (report_type === "document_status") {
    title = "Document Status Index";
    headers = ["Exporter", "Document Title", "Kind", "Evidence Status", "Provenance", "Expiration", "Uploaded"];

    if (supplierIds.length === 0) {
      rows = [];
    } else {
      const { data, error } = await (admin.from("documents") as any)
        .select("title, document_kind, evidence_status, evidence_source, expiration_date, created_at, supplier_id")
        .in("supplier_id", supplierIds)
        .is("soft_deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      rows = (data ?? []).map((d: any) => [
        supplierName.get(d.supplier_id) ?? "",
        d.title,
        d.document_kind ?? "",
        d.evidence_status ?? "",
        SOURCE_LABEL[d.evidence_source] ?? d.evidence_source ?? "",
        d.expiration_date ? new Date(d.expiration_date).toLocaleDateString() : "",
        new Date(d.created_at).toLocaleDateString(),
      ]);
    }

  } else if (report_type === "fsvp_record_package") {
    // The artifact an importer hands to FDA when records are requested. The
    // binding constraint during an FSVP records request is assembling this, not
    // transmitting it — see docs/importer-workflow-analysis.md §2.
    const recordId = body.fsvp_record_id;
    if (!recordId) {
      return NextResponse.json(
        { error: "fsvp_record_id is required for an FSVP record package." },
        { status: 400 }
      );
    }

    const { data: record, error } = await (admin.from("fsvp_records") as any)
      .select(`
        id, status, overall_score, approved_at, approved_by_profile_id, reassessment_due_at,
        hazard_analysis_notes, supplier_evaluation_notes,
        facility_evaluation_notes, verification_determination,
        importer_id, supplier_id, product_id,
        suppliers!inner(company_name, country, fda_registration_number, duns_number),
        facilities_verify!inner(facility_name, facility_type, fda_registration_number),
        products_verify!inner(product_name, country_of_origin, intended_use),
        rule_versions!inner(version_number)
      `)
      .eq("id", recordId)
      .maybeSingle();

    if (error)   return NextResponse.json({ error: error.message }, { status: 500 });
    if (!record) return NextResponse.json({ error: "FSVP record not found." }, { status: 404 });
    // Only a platform administrator may pull another tenant's package. This
    // used to exempt reviewers too, which was safe while `reviewer` meant
    // platform-wide; 004_reviewer_tenancy.sql made a reviewer with an
    // importer_id a tenant user (an FSVP qualified individual), and the guard
    // above already rejects anyone without an importer_id — so the only
    // reviewers reaching here are tenant-scoped and must be confined.
    if (record.importer_id !== importerId && profile.role !== "administrator") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: evidence } = await (admin.from("fsvp_record_evidence") as any)
      .select("notes, documents!inner(title, document_kind, evidence_status, evidence_source, attested_by_name, attested_at, expiration_date)")
      .eq("fsvp_record_id", recordId);

    title = `FSVP Record — ${record.products_verify.product_name}`;
    subtitle = `${record.suppliers.company_name} · ${record.facilities_verify.facility_name} · Rule v${record.rule_versions.version_number}`;
    headers = ["Document", "Kind", "Status", "Provenance", "Attested by", "Expires"];

    rows = ((evidence ?? []) as any[]).map((e) => [
      e.documents.title,
      e.documents.document_kind ?? "",
      e.documents.evidence_status ?? "",
      SOURCE_LABEL[e.documents.evidence_source] ?? e.documents.evidence_source ?? "",
      e.documents.attested_by_name ?? "",
      e.documents.expiration_date ? new Date(e.documents.expiration_date).toLocaleDateString() : "",
    ]);

    if (format === "html") {
      const importerRow = await (admin.from("importers") as any)
        .select("legal_name, duns_number, ein")
        .eq("id", record.importer_id)
        .maybeSingle();
      const imp = importerRow.data ?? {};

      // Whether FSVP applies to this food at all, and on what authority. Comes
      // first in the package because it governs everything below it — for a
      // modified determination it is the reason two of the three § 1.503
      // attestations are absent, and an investigator should not have to infer that.
      const { data: applicability } = await (admin.from("fsvp_applicability_determinations") as any)
        .select("outcome, basis, citation, rationale, determined_at, expires_at, qualified_individuals(profile_id)")
        .eq("importer_id", record.importer_id)
        .eq("supplier_id", record.supplier_id)
        .eq("product_id", record.product_id)
        .is("superseded_at", null)
        .maybeSingle();

      // § 1.503 / § 1.510(a)(2): who was qualified, what they attested to, and when.
      // This is the part of the package an investigator turns to first, so it
      // prints the signature even when it has gone stale or been withdrawn —
      // presenting only the clean ones would be the dishonest version.
      const { data: rawAttestations } = await (admin.from("qi_attestations") as any)
        .select(`
          attestation_type, statement, content_hash, signed_at,
          signed_by_profile_id, revoked_at, revoked_reason,
          qualified_individuals(qualification_basis, education, training, experience)
        `)
        .eq("fsvp_record_id", recordId)
        .order("signed_at", { ascending: false });

      const attestationRows = (rawAttestations ?? []) as any[];

      const liveHash: Record<string, string> = {
        hazard_analysis:            await hashAttestationContent(record.hazard_analysis_notes),
        supplier_evaluation:        await hashAttestationContent(record.supplier_evaluation_notes),
        verification_determination: await hashAttestationContent(record.verification_determination),
      };

      const peopleIds = [
        ...new Set([
          ...attestationRows.map((a) => a.signed_by_profile_id),
          record.approved_by_profile_id,
          (applicability as any)?.qualified_individuals?.profile_id,
        ].filter(Boolean)),
      ] as string[];

      const { data: rawPeople } = peopleIds.length > 0
        ? await (admin.from("profiles") as any).select("id, full_name, email").in("id", peopleIds)
        : { data: [] };
      const personName = new Map(
        ((rawPeople ?? []) as Array<{ id: string; full_name: string | null; email: string }>)
          .map((p) => [p.id, p.full_name ?? p.email])
      );

      const attestationRowsHtml = attestationRows.length
        ? attestationRows.map((a) => {
            const stale = a.revoked_at === null && liveHash[a.attestation_type] !== a.content_hash;
            const status = a.revoked_at
              ? `Withdrawn ${new Date(a.revoked_at).toLocaleDateString()}${a.revoked_reason ? ` — ${esc(a.revoked_reason)}` : ""}`
              : stale
              ? "Superseded — the determination was edited after signing"
              : "Current";
            const qi = a.qualified_individuals ?? {};
            const basisDetail = [qi.education, qi.training, qi.experience]
              .filter(Boolean)
              .join("; ");
            return `<tr>
              <td>${esc(ATTESTATION_LABEL[a.attestation_type as keyof typeof ATTESTATION_LABEL] ?? a.attestation_type)}</td>
              <td>${esc(personName.get(a.signed_by_profile_id) ?? "Unknown")}${
                qi.qualification_basis ? `<br><span style="color:#64748b;">Qualified by ${esc(qi.qualification_basis)}</span>` : ""
              }${basisDetail ? `<br><span style="color:#64748b;font-size:11px;">${esc(basisDetail)}</span>` : ""}</td>
              <td>${new Date(a.signed_at).toLocaleDateString()}</td>
              <td>${status}</td>
            </tr>`;
          }).join("")
        : '<tr><td colspan="4" style="color:#94a3b8;">No qualified individual has signed this record.</td></tr>';

      const attestationStatement = attestationRows.find((a) => !a.revoked_at)?.statement ?? null;

      const approverName = record.approved_by_profile_id
        ? personName.get(record.approved_by_profile_id) ?? "Unknown"
        : null;

      const section = (heading: string, text: string | null) =>
        `<h2 style="font-size:15px;margin:24px 0 6px;">${esc(heading)}</h2>
         <p style="font-size:13px;color:#0f172a;white-space:pre-wrap;margin:0;">${
           text ? esc(text) : '<span style="color:#94a3b8;">Not documented.</span>'
         }</p>`;

      const importerUploaded = rows.filter((r) => r[3] === SOURCE_LABEL.importer_uploaded).length;

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Arial,sans-serif;padding:40px;color:#0f172a;max-width:900px;margin:0 auto;}
h1{font-size:22px;margin:0 0 4px;}h2{border-bottom:1px solid #e2e8f0;padding-bottom:4px;}
table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin-top:8px;}
th{background:#2E4057;color:#fff;padding:8px 12px;text-align:left;font-size:12px;}
td{padding:8px 12px;font-size:12px;border-bottom:1px solid #e2e8f0;}
.meta{font-size:12px;color:#64748b;}
.note{background:#fffbeb;border:1px solid #fde68a;padding:12px;font-size:12px;margin-top:16px;}
@media print{button{display:none;}}</style></head><body>
<button onclick="window.print()" style="margin-bottom:20px;padding:8px 16px;background:#2E4057;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Print / Save as PDF</button>
<h1>Foreign Supplier Verification Program Record</h1>
<p class="meta">${esc(subtitle)} · Generated ${new Date().toLocaleDateString()}</p>

<h2>FSVP Importer</h2>
<p class="meta">${esc(imp.legal_name ?? "—")}${imp.duns_number ? ` · DUNS ${esc(imp.duns_number)}` : ""}${imp.ein ? ` · EIN ${esc(imp.ein)}` : ""}</p>

<h2>Foreign Supplier</h2>
<p class="meta">${esc(record.suppliers.company_name)} · ${esc(record.suppliers.country)}${
        record.suppliers.fda_registration_number ? ` · FDA ${esc(record.suppliers.fda_registration_number)}` : ""
      }</p>

<h2>Facility &amp; Food</h2>
<p class="meta">${esc(record.facilities_verify.facility_name)} (${esc(record.facilities_verify.facility_type)}) — ${esc(record.products_verify.product_name)}, origin ${esc(record.products_verify.country_of_origin ?? "—")}</p>

<h2>FSVP Applicability</h2>
${applicability
  ? (() => {
      const a = applicability as any;
      const spec = basisSpec(a.basis);
      const signer = personName.get(a.qualified_individuals?.profile_id ?? "") ?? "Unknown";
      return `<p class="meta"><strong>${esc(OUTCOME_LABEL[a.outcome as "in_scope" | "exempt" | "modified"])}</strong>${
        spec ? ` — ${esc(spec.label)}` : ""
      } · ${esc(a.citation)}</p>
      <p style="font-size:13px;white-space:pre-wrap;margin:6px 0 0;">${esc(a.rationale)}</p>
      <p class="meta" style="margin-top:6px;">Determined ${new Date(a.determined_at).toLocaleDateString()} by ${esc(signer)}${
        a.expires_at ? ` · review by ${new Date(a.expires_at).toLocaleDateString()}` : ""
      }</p>${
        a.outcome === "modified"
          ? `<div class="note">Under ${esc(a.citation)} this food is subject to modified requirements. A hazard analysis and foreign supplier evaluation are not required, which is why no attestation for either appears below.</div>`
          : ""
      }`;
    })()
  : '<p class="meta" style="color:#94a3b8;">No applicability determination has been made for this food.</p>'}

${section("Hazard Analysis (§ 1.504)", record.hazard_analysis_notes)}
${section("Foreign Supplier Evaluation (§ 1.505)", record.supplier_evaluation_notes)}
${section("Facility Evaluation", record.facility_evaluation_notes)}
${section("Verification Determination (§§ 1.506–1.507)", record.verification_determination)}

<h2>Qualified Individual Attestations (§§ 1.503, 1.510(a)(2))</h2>
<table><thead><tr><th>Determination</th><th>Signed by</th><th>Date</th><th>Status</th></tr></thead>
<tbody>${attestationRowsHtml}</tbody></table>
${attestationStatement ? `<p class="meta" style="margin-top:8px;">Statement signed: &ldquo;${esc(attestationStatement)}&rdquo;</p>` : ""}

<h2>Evidence Index</h2>
<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${
        rows.length
          ? rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
          : '<tr><td colspan="6" style="color:#94a3b8;">No evidence attached.</td></tr>'
      }</tbody></table>

${importerUploaded > 0 ? `<div class="note"><strong>Provenance note.</strong> ${importerUploaded} of ${rows.length} documents in this package were provided by the importer on the supplier's behalf rather than submitted by the supplier directly. The "Attested by" column records who at the supplier furnished each one.</div>` : ""}

<h2>Determination</h2>
<p class="meta">Status: ${esc(record.status)}${record.overall_score !== null ? ` · Score ${esc(record.overall_score)}/100` : ""}${
        record.approved_at ? ` · Approved ${new Date(record.approved_at).toLocaleDateString()}` : ""
      }${record.reassessment_due_at ? ` · Reassessment due ${new Date(record.reassessment_due_at).toLocaleDateString()}` : ""}</p>
${approverName ? `<p class="meta">Approval recorded by ${esc(approverName)} for the importer. The food-safety determinations above were attested to separately by the qualified individuals listed.</p>` : ""}

<p class="meta" style="margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px;">
This platform does not provide legal or regulatory advice.
</p>
</body></html>`;

      await (admin.from("generated_reports") as any).insert({
        importer_id: importerId,
        fsvp_record_id: recordId,
        supplier_id: record.supplier_id,
        report_type,
        export_format: format,
        title: `${title} — ${new Date().toLocaleDateString()}`,
        generated_by_profile_id: user.id,
      });

      return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
    }

  } else {
    return NextResponse.json({ error: "Invalid report_type" }, { status: 400 });
  }

  // Only record the report once the data actually came back.
  await (admin.from("generated_reports") as any).insert({
    importer_id: importerId,
    report_type,
    export_format: format,
    title: `${title} — ${new Date().toLocaleDateString()}`,
    generated_by_profile_id: user.id,
  });

  if (format === "csv") {
    return new NextResponse(toCSV(headers, rows), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${report_type}_${Date.now()}.csv"`,
      },
    });
  }

  return new NextResponse(toHTML(title, headers, rows, subtitle), {
    headers: { "Content-Type": "text/html" },
  });
}
