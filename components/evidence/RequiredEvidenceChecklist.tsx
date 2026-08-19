import { RequirementItemRow } from "./RequirementItemRow";

type SupabaseLike = { from: (table: string) => any };

function bestStatus(statuses: string[]): string {
  if (statuses.includes("accepted")) return "accepted";
  if (statuses.includes("under_review")) return "under_review";
  if (statuses.includes("submitted")) return "submitted";
  if (statuses.includes("needs_revision")) return "needs_revision";
  if (statuses.includes("rejected")) return "rejected";
  return "not_submitted";
}

/**
 * The requirements a company, facility or product still owes evidence for.
 *
 * "supplier" was added on 2026-08-13 to close an incoherence on /my-readiness:
 * the score there is computed from requirement_items via
 * lib/readiness/supplier-score.ts, while the checklist beneath it came from
 * the since-deleted SupplierReadinessPanel, which read the older
 * fsvp_requirements table. A
 * number and a list that disagree about what is outstanding are worse than
 * either alone. Both now read the same model.
 */
export async function RequiredEvidenceChecklist({
  linkType,
  entityId,
  supplierId,
  supabase,
  allowGeneratedActions = false,
}: {
  linkType: "supplier" | "facility" | "product";
  /** The supplier id when linkType is "supplier" — the company IS the entity. */
  entityId: string;
  supplierId: string;
  supabase: SupabaseLike;
  allowGeneratedActions?: boolean;
}) {
  const { data: pubVersion } = await (supabase.from("rule_versions") as any)
    .select("id")
    .eq("status", "published")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pubVersion?.id) {
    return (
      <p className="mt-4 rounded-md border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Readiness requirements are not configured yet.
      </p>
    );
  }

  const [sectionsRes, itemsRes, docsRes, fsvpRecordRes] = await Promise.all([
    (supabase.from("requirement_sections") as any)
      .select("id, section_key, section_name, sort_order")
      .eq("rule_version_id", pubVersion.id)
      .eq("applies_to", linkType)
      .order("sort_order"),

    (supabase.from("requirement_sections") as any)
      .select("id, requirement_items(id, item_key, item_name, is_required, is_critical_blocker, sort_order)")
      .eq("rule_version_id", pubVersion.id)
      .eq("applies_to", linkType),

    // Company-level evidence hangs off supplier_id rather than a linked entity,
    // which is the same column lib/readiness/supplier-score.ts counts — so the
    // list and the score above it cannot disagree.
    linkType === "supplier"
      ? (supabase.from("documents") as any)
          .select("requirement_item_id, evidence_status")
          .eq("supplier_id", entityId)
          .is("soft_deleted_at", null)
          .not("requirement_item_id", "is", null)
    : linkType === "facility"
      ? (supabase.from("documents") as any)
          .select("requirement_item_id, evidence_status")
          .eq("facility_id", entityId)
          .is("soft_deleted_at", null)
          .not("requirement_item_id", "is", null)
      : (supabase.from("documents") as any)
          .select("requirement_item_id, evidence_status")
          .eq("linked_entity_type", "product")
          .eq("linked_entity_id", entityId)
          .is("soft_deleted_at", null)
          .not("requirement_item_id", "is", null),

    linkType === "product"
      ? (supabase.from("fsvp_records") as any)
          .select("id")
          .eq("product_id", entityId)
          .eq("supplier_id", supplierId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const sections: Array<{ id: string; section_key: string; section_name: string }> = sectionsRes.data ?? [];

  type RawItem = { id: string; item_key: string; item_name: string; is_required: boolean; is_critical_blocker: boolean; sort_order: number };
  type RawSec = { id: string; requirement_items: RawItem[] };

  const itemsBySectionId = new Map<string, RawItem[]>();
  for (const sec of (itemsRes.data ?? []) as RawSec[]) {
    const sorted = [...(sec.requirement_items ?? [])]
      .filter((i) => i.is_required)
      .sort((a, b) => a.sort_order - b.sort_order);
    itemsBySectionId.set(sec.id, sorted);
  }

  const docByItemId = new Map<string, string[]>();
  for (const doc of (docsRes.data ?? []) as Array<{ requirement_item_id: string | null; evidence_status: string | null }>) {
    if (!doc.requirement_item_id) continue;
    const existing = docByItemId.get(doc.requirement_item_id) ?? [];
    existing.push(doc.evidence_status ?? "not_submitted");
    docByItemId.set(doc.requirement_item_id, existing);
  }

  const fsvpRecordId = fsvpRecordRes.data?.id as string | undefined;
  const hazardRes = fsvpRecordId
    ? await (supabase.from("fsvp_plan_hazard_analyses") as any)
        .select("id, status, fsvp_plan_hazard_items(id)")
        .eq("fsvp_record_id", fsvpRecordId)
        .neq("status", "superseded")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const hazardAnalysis = hazardRes.data as {
    id: string;
    status: string;
    fsvp_plan_hazard_items?: Array<{ id: string }>;
  } | null;

  function generatedStatusFor(item: RawItem): string | null {
    if (linkType !== "product" || !hazardAnalysis) return null;
    if (item.item_key === "product_hazard_analysis_doc") {
      return hazardAnalysis.status === "final" ? "accepted" : "in_progress";
    }
    if (item.item_key === "known_or_reasonably_foreseeable") {
      if ((hazardAnalysis.fsvp_plan_hazard_items ?? []).length === 0) return "in_progress";
      return hazardAnalysis.status === "final" ? "accepted" : "in_progress";
    }
    return null;
  }

  function createActionFor(item: RawItem) {
    if (
      !allowGeneratedActions ||
      linkType !== "product" ||
      !["product_hazard_analysis_doc", "known_or_reasonably_foreseeable"].includes(item.item_key)
    ) {
      return undefined;
    }

    return {
      productId: entityId,
      existingHref: fsvpRecordId ? `/fsvp-records/${fsvpRecordId}#hazard-analysis` : null,
    };
  }

  const sectionsWithItems = sections
    .map((sec) => ({ ...sec, items: itemsBySectionId.get(sec.id) ?? [] }))
    .filter((sec) => sec.items.length > 0);

  if (sectionsWithItems.length === 0) {
    return (
      <p className="mt-4 rounded-md border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        No specific documents are required for this {linkType} yet.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {sectionsWithItems.map((sec) => (
        <div key={sec.section_key} className="overflow-hidden rounded-lg border border-line">
          <div className="border-b border-line bg-slate-50 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{sec.section_name}</p>
          </div>
          {sec.items.map((item) => (
            <RequirementItemRow
              key={item.id}
              itemName={item.item_name}
              status={generatedStatusFor(item) ?? bestStatus(docByItemId.get(item.id) ?? [])}
              isCriticalBlocker={item.is_critical_blocker}
              linkType={linkType}
              entityId={entityId}
              supplierId={supplierId}
              requirementItemId={item.id}
              createAction={createActionFor(item)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
