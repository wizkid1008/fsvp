// POST { report_type, format }
// Generates a CSV or printable HTML report and records it in generated_reports.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

const ALLOWED_ROLES = new Set(["us_importer", "reviewer", "administrator"]);

type ReportType = "supplier_readiness" | "compliance_gap" | "document_status";
type ReportFormat = "csv" | "html";

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${(v ?? "").toString().replace(/"/g, '""')}"`;
  return [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");
}

function toHTML(title: string, headers: string[], rows: string[][]): string {
  const headerCells = headers.map((h) => `<th style="background:#2E4057;color:#fff;padding:8px 12px;text-align:left;font-size:13px;">${h}</th>`).join("");
  const dataRows = rows
    .map((r, i) => {
      const cells = r.map((c) => `<td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #e2e8f0;">${c ?? ""}</td>`).join("");
      return `<tr style="background:${i % 2 === 0 ? "#f8fafc" : "#fff"};">${cells}</tr>`;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;padding:32px;color:#0f172a;}h1{font-size:20px;margin-bottom:4px;}p{font-size:13px;color:#64748b;margin-bottom:24px;}table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0;}@media print{button{display:none;}}</style>
</head><body>
<h1>${title}</h1>
<p>Generated ${new Date().toLocaleDateString()}</p>
<button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;background:#2E4057;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Print / Save as PDF</button>
<table><thead><tr>${headerCells}</tr></thead><tbody>${dataRows}</tbody></table>
</body></html>`;
}

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

  const body = await req.json();
  const { report_type, format } = body as { report_type: ReportType; format: ReportFormat };

  if (!report_type || !format) {
    return NextResponse.json({ error: "report_type and format are required" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const importerId = profile.importer_id;

  let headers: string[] = [];
  let rows: string[][] = [];
  let title = "";

  if (report_type === "supplier_readiness") {
    title = "Supplier Readiness Report";
    headers = ["Supplier", "Score (%)", "Status", "Gap Summary", "Created"];

    const { data: assessments } = await (admin.from("readiness_assessments") as any)
      .select("overall_score, status, gap_summary, created_at, supplier_id, foreign_suppliers(supplier_name)")
      .eq("importer_id", importerId)
      .order("created_at", { ascending: false });

    rows = (assessments ?? []).map((a: any) => [
      a.foreign_suppliers?.supplier_name ?? a.supplier_id,
      String(Math.round(Number(a.overall_score))),
      a.status,
      a.gap_summary ?? "",
      new Date(a.created_at).toLocaleDateString(),
    ]);

  } else if (report_type === "compliance_gap") {
    title = "Compliance Gap Register";
    headers = ["Supplier", "Product", "Issue", "Source", "Status", "Opened", "Closed"];

    const { data: actions } = await (admin.from("corrective_actions") as any)
      .select("issue_description, triggered_by, status, triggered_at, closed_at, foreign_suppliers(supplier_name), foods(food_name)")
      .eq("importer_id", importerId)
      .order("triggered_at", { ascending: false });

    rows = (actions ?? []).map((a: any) => [
      a.foreign_suppliers?.supplier_name ?? "",
      a.foods?.food_name ?? "",
      a.issue_description,
      a.triggered_by.replace(/_/g, " "),
      a.status,
      new Date(a.triggered_at).toLocaleDateString(),
      a.closed_at ? new Date(a.closed_at).toLocaleDateString() : "",
    ]);

  } else if (report_type === "document_status") {
    title = "Document Status Index";
    headers = ["Supplier", "Document Title", "Kind", "Evidence Status", "Expiration", "Uploaded"];

    const { data: docs } = await (admin.from("documents") as any)
      .select("title, document_kind, evidence_status, expiration_date, created_at, foreign_suppliers(supplier_name)")
      .eq("importer_id", importerId)
      .is("soft_deleted_at", null)
      .order("created_at", { ascending: false });

    rows = (docs ?? []).map((d: any) => [
      d.foreign_suppliers?.supplier_name ?? "",
      d.title,
      d.document_kind ?? "",
      d.evidence_status ?? "",
      d.expiration_date ? new Date(d.expiration_date).toLocaleDateString() : "",
      new Date(d.created_at).toLocaleDateString(),
    ]);

  } else {
    return NextResponse.json({ error: "Invalid report_type" }, { status: 400 });
  }

  // Record the report in generated_reports
  await (admin.from("generated_reports") as any).insert({
    importer_id: importerId,
    report_type,
    export_format: format,
    title: `${title} — ${new Date().toLocaleDateString()}`,
    generated_by_profile_id: user.id,
    generated_at: new Date().toISOString(),
  });

  if (format === "csv") {
    const csv = toCSV(headers, rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${report_type}_${Date.now()}.csv"`,
      },
    });
  } else {
    const html = toHTML(title, headers, rows);
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html" },
    });
  }
}
