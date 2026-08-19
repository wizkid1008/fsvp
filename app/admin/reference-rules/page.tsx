import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ConfigurationNotice } from "@/components/ui/ConfigurationNotice";
import { ReferenceRulesClient, type ReferenceRuleRow } from "@/components/admin/ReferenceRulesClient";
import {
  ReferenceEntryActions,
  type CommodityOption,
  type CountryOption,
} from "@/components/admin/ReferenceEntryForms";
import {
  ClassificationRequestQueue,
  type ClassificationRequestQueueRow,
  type QueueCommodityOption,
} from "@/components/admin/ClassificationRequestQueue";
import { requireProfileRole } from "@/lib/auth/protection";
import { tryAdminClient } from "@/lib/supabase/admin-guard";

export const runtime = "edge";

/**
 * Where country-commodity rules are confirmed and re-checked.
 *
 * Without this screen the review dating added in 012 and the verification
 * added in 014 are mechanisms nobody can act on — the schema would refuse to
 * rely on stale rules and no one would ever be told which ones they were.
 */
export default async function ReferenceRulesPage() {
  const { role, realRole, user } = await requireProfileRole("/admin/reference-rules", ["administrator"]);

  const adminResult = tryAdminClient();
  if (!adminResult.ok) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader title="Country-Commodity Rules" description="" />
        <ConfigurationNotice message={adminResult.message} />
      </AppShell>
    );
  }
  const admin = adminResult.client;

  const [rulesResult, commoditiesResult, countriesResult, requestsResult] = await Promise.all([
    (admin.from("country_commodity_rules_status") as any)
      .select(`
        id, origin_country, origin_region, intended_use, processing_state,
        admissibility, citation, source_url,
        verification_status, verified_at, verified_against, verified_by_profile_id,
        created_by_profile_id, review_due_at, days_until_review,
        is_current, is_draft, is_overdue, source_moved,
        commodities(common_name, plant_part)
      `)
      .is("superseded_at", null)
      .order("review_due_at"),
    (admin.from("commodities") as any)
      .select("id, common_name, scientific_name, commodity_class, plant_part, is_propagative")
      .eq("active", true)
      .order("common_name"),
    (admin.from("countries") as any)
      .select("country_code, country_name")
      .eq("is_active", true)
      .order("country_name"),
    // Oldest first: a request that has waited longest is a product that has
    // been stuck longest.
    (admin.from("commodity_classification_requests") as any)
      .select(`
        id, described_as, commodity_class, plant_part, is_propagative, notes, pcb_candidates, created_at,
        products_verify(product_name), importers(display_name)
      `)
      .eq("status", "open")
      .order("created_at", { ascending: true }),
  ]);

  const rawRules = rulesResult.data;

  const rules = (rawRules ?? []) as any[];

  // Names come from profiles, whose RLS exposes only the caller's own row, so
  // they are resolved here with the admin client.
  const personIds = [
    ...new Set(
      rules.flatMap((r) => [r.verified_by_profile_id, r.created_by_profile_id])
           .filter((id): id is string => Boolean(id))
    ),
  ];

  const { data: rawPeople } = personIds.length > 0
    ? await (admin.from("profiles") as any).select("id, full_name, email").in("id", personIds)
    : { data: [] };

  const personName = new Map(
    ((rawPeople ?? []) as Array<{ id: string; full_name: string | null; email: string }>)
      .map((p) => [p.id, p.full_name ?? p.email])
  );

  const shaped: ReferenceRuleRow[] = rules.map((r) => ({
    id:                  r.id,
    commodity_name:      [r.commodities?.common_name ?? "Unclassified commodity",
                          r.commodities?.plant_part && r.commodities.plant_part !== "not_applicable"
                            ? `(${r.commodities.plant_part})` : ""]
                          .filter(Boolean).join(" "),
    // A region-scoped rule is shown as such: it is the one shape the resolver
    // cannot evaluate, so it should be visibly different here too.
    origin:              r.origin_country ?? `${r.origin_region} (region — not auto-resolvable)`,
    intended_use:        r.intended_use,
    processing_state:    r.processing_state,
    admissibility:       r.admissibility,
    citation:            r.citation,
    source_url:          r.source_url,
    verification_status: r.verification_status,
    verified_at:         r.verified_at,
    verified_against:    r.verified_against,
    verifier_name:       r.verified_by_profile_id ? personName.get(r.verified_by_profile_id) ?? null : null,
    entered_by_name:     r.created_by_profile_id ? personName.get(r.created_by_profile_id) ?? null : null,
    entered_by_profile_id: r.created_by_profile_id,
    review_due_at:       r.review_due_at,
    days_until_review:   Number(r.days_until_review ?? 0),
    is_current:          Boolean(r.is_current),
    is_draft:            Boolean(r.is_draft),
    is_overdue:          Boolean(r.is_overdue),
    source_moved:        Boolean(r.source_moved),
  }));
  const classificationRequests: ClassificationRequestQueueRow[] =
    ((requestsResult.data ?? []) as any[]).map((r) => {
      // pcb_candidates is a snapshot written by the API, not user input, but it
      // is jsonb and therefore shape-checked rather than trusted.
      const snapshot = r.pcb_candidates as { searched_for?: string; rows?: unknown } | null;
      return {
        id:               r.id,
        product_name:     r.products_verify?.product_name ?? "Unnamed product",
        importer_name:    r.importers?.display_name ?? null,
        described_as:     r.described_as,
        commodity_class:  r.commodity_class,
        plant_part:       r.plant_part,
        is_propagative:   r.is_propagative,
        notes:            r.notes,
        pcb_rows:         Array.isArray(snapshot?.rows) ? snapshot!.rows as Array<Record<string, string | null>> : [],
        pcb_searched_for: snapshot?.searched_for ?? null,
        created_at:       r.created_at,
      };
    });

  const currentCount = shaped.filter((rule) => rule.is_current).length;
  const draftCount = shaped.filter((rule) => rule.is_draft).length;
  const overdueCount = shaped.filter((rule) => rule.is_overdue).length;
  const movedCount = shaped.filter((rule) => rule.source_moved).length;

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Country-Commodity Rules"
        description={
          "Whether a commodity may enter from a given origin, and under what conditions. These rules " +
          "are curated by hand from agency publications, so this screen is where they are confirmed " +
          "against the source and re-checked before they go stale."
        }
        actionSlot={
          <ReferenceEntryActions
            commodities={(commoditiesResult.data ?? []) as CommodityOption[]}
            countries={(countriesResult.data ?? []) as CountryOption[]}
          />
        }
      />
      <ClassificationRequestQueue
        requests={classificationRequests}
        commodities={(commoditiesResult.data ?? []) as QueueCommodityOption[]}
      />

      <section className="mt-6 rounded-lg border border-line bg-white p-5 shadow-soft">
        <h2 className="text-base font-semibold text-ink">Reference Coverage</h2>
        <p className="mt-1 text-sm text-slate-500">
          Start with the commodities and origins used by active importer products. Verified, current rules are the only ones that can support an admissibility determination.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            { label: "Current", value: currentCount, tone: "success" as const },
            { label: "Draft", value: draftCount, tone: draftCount > 0 ? "warning" as const : "neutral" as const },
            { label: "Overdue", value: overdueCount, tone: overdueCount > 0 ? "warning" as const : "neutral" as const },
            { label: "Source Changed", value: movedCount, tone: movedCount > 0 ? "danger" as const : "neutral" as const },
          ].map((item) => (
            <div key={item.label} className="rounded-md border border-line bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-600">{item.label}</p>
              <p className="mt-2 text-3xl font-semibold text-ink">{item.value}</p>
            </div>
          ))}
        </div>
      </section>
      <ReferenceRulesClient rules={shaped} viewerProfileId={user.id} />
    </AppShell>
  );
}
