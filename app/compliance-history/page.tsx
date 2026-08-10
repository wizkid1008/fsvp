import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  ComplianceHistoryClient,
  type FindingRow,
  type ScreeningRow,
  type SourceStatus,
  type SupplierOption,
} from "@/components/regulatory/ComplianceHistoryClient";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolvePreviewedAccountId } from "@/lib/preview-role";
import { isActiveOn } from "@/lib/fsvp/qualified-individuals";
import { REGULATORY_SOURCES } from "@/lib/regulatory/sources";

export const runtime = "edge";

export default async function ComplianceHistoryPage() {
  const { role, realRole, user } = await requireProfileRole("/compliance-history", [
    "us_importer", "reviewer", "administrator",
  ]);
  const supabase = createServerSupabaseClient();
  const admin = createAdminSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("importer_id")
    .eq("id", user.id)
    .maybeSingle();

  const importerId: string | null = resolvePreviewedAccountId(realRole, profile?.importer_id ?? null);

  const description =
    "21 CFR 1.505(a)(1)(iv) requires you to consider a supplier's FDA compliance history when you " +
    "evaluate them. These are the records FDA has published about firms resembling your suppliers — " +
    "and because FDA identifies firms by an establishment identifier we mostly do not hold, a " +
    "resemblance is not an identification. Nothing counts as a supplier's history until someone here " +
    "confirms it is actually them.";

  if (!importerId) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader title="Compliance History" description={description} />
        <div className="mt-6 rounded-lg border border-line bg-white px-6 py-10 text-center">
          <p className="text-sm text-slate-600">
            Your account is not linked to an importing organization yet.
          </p>
        </div>
      </AppShell>
    );
  }

  const { data: links } = await (admin.from("supplier_relationships") as any)
    .select("supplier_id")
    .eq("relationship_type", "importer_supplier")
    .eq("importer_id", importerId)
    .in("status", ["active", "pending_invite"]);

  const supplierIds = [
    ...new Set(
      ((links ?? []) as Array<{ supplier_id: string | null }>)
        .map((l) => l.supplier_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const [{ data: rawFindings }, { data: rawScreenings }, { data: rawRuns }, { data: rawSuppliers }, { data: qi }] =
    await Promise.all([
      (admin.from("supplier_compliance_history") as any)
        .select(`
          id, supplier_id, facility_id, match_status, match_method, match_confidence,
          match_rationale, reviewed_at, reviewed_by_profile_id, review_notes,
          suppliers(company_name),
          facilities_verify(facility_name),
          regulatory_events(
            source, event_type, event_date, firm_name, firm_country, firm_address,
            product_description, summary, classification
          )
        `)
        .eq("importer_id", importerId)
        .order("match_confidence", { ascending: false })
        .limit(500),

      (admin.from("supplier_compliance_screenings") as any)
        .select(`
          id, supplier_id, conclusion, rationale, confirmed_event_count,
          screened_at, expires_at, screened_by_profile_id,
          suppliers(company_name)
        `)
        .eq("importer_id", importerId)
        .is("superseded_at", null)
        .order("screened_at", { ascending: false }),

      (admin.from("regulatory_ingest_runs") as any)
        .select("source, completed_at, window_to")
        .eq("status", "succeeded")
        .order("completed_at", { ascending: false }),

      supplierIds.length > 0
        ? (admin.from("suppliers") as any)
            .select("id, company_name")
            .in("id", supplierIds)
            .order("company_name")
        : Promise.resolve({ data: [] }),

      (admin.from("qualified_individuals") as any)
        .select("id, active_from, active_to")
        .eq("profile_id", user.id)
        .eq("importer_id", importerId)
        .maybeSingle(),
    ]);

  // Reviewer and screener names come from profiles, whose RLS exposes only the
  // caller's own row — so they are resolved here with the admin client, the same
  // way the applicability page resolves signers.
  const personIds = [
    ...new Set([
      ...((rawFindings ?? []) as Array<{ reviewed_by_profile_id: string | null }>)
        .map((f) => f.reviewed_by_profile_id),
      ...((rawScreenings ?? []) as Array<{ screened_by_profile_id: string | null }>)
        .map((s) => s.screened_by_profile_id),
    ].filter((id): id is string => Boolean(id))),
  ];

  const { data: rawPeople } = personIds.length > 0
    ? await (admin.from("profiles") as any).select("id, full_name, email").in("id", personIds)
    : { data: [] };

  const personName = new Map(
    ((rawPeople ?? []) as Array<{ id: string; full_name: string | null; email: string }>)
      .map((p) => [p.id, p.full_name ?? p.email])
  );

  const findings: FindingRow[] = ((rawFindings ?? []) as any[])
    // A finding whose event failed to join is not renderable and, more to the
    // point, not reviewable — the reviewer needs FDA's side to compare against.
    .filter((f) => f.regulatory_events)
    .map((f) => ({
      id:               f.id,
      supplier_id:      f.supplier_id,
      supplier_name:    f.suppliers?.company_name ?? null,
      facility_name:    f.facilities_verify?.facility_name ?? null,
      match_status:     f.match_status,
      match_method:     f.match_method,
      match_confidence: Number(f.match_confidence),
      match_rationale:  f.match_rationale,
      reviewed_at:      f.reviewed_at,
      reviewer_name:    f.reviewed_by_profile_id ? personName.get(f.reviewed_by_profile_id) ?? null : null,
      review_notes:     f.review_notes,
      event:            f.regulatory_events,
    }));

  const screenings: ScreeningRow[] = ((rawScreenings ?? []) as any[]).map((s) => ({
    id:                    s.id,
    supplier_id:           s.supplier_id,
    supplier_name:         s.suppliers?.company_name ?? "Supplier",
    conclusion:            s.conclusion,
    rationale:             s.rationale,
    confirmed_event_count: s.confirmed_event_count,
    screened_at:           s.screened_at,
    expires_at:            s.expires_at,
    screener_name:         personName.get(s.screened_by_profile_id) ?? "Unknown",
  }));

  const freshest = new Map<string, { completed_at: string | null; window_to: string | null }>();
  for (const r of (rawRuns ?? []) as Array<{ source: string; completed_at: string | null; window_to: string | null }>) {
    if (!freshest.has(r.source)) freshest.set(r.source, r);
  }

  const sources: SourceStatus[] = REGULATORY_SOURCES.map((s) => ({
    id:              s.id,
    label:           s.label,
    access:          s.access,
    caveat:          s.caveat,
    cadence:         s.cadence,
    referenceUrl:    s.referenceUrl,
    lastRefreshedAt: freshest.get(s.id)?.completed_at ?? null,
    dataThrough:     freshest.get(s.id)?.window_to ?? null,
  }));

  const suppliers: SupplierOption[] = ((rawSuppliers ?? []) as Array<{ id: string; company_name: string }>)
    .map((s) => ({ id: s.id, name: s.company_name }));

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader title="Compliance History" description={description} />
      <ComplianceHistoryClient
        sources={sources}
        findings={findings}
        screenings={screenings}
        suppliers={suppliers}
        viewerIsActiveQi={Boolean(qi && isActiveOn(qi))}
        // An administrator previewing a tenant reads this queue but cannot
        // decide in their name; the API refuses it too.
        canDecide={realRole !== "administrator"}
      />
    </AppShell>
  );
}
