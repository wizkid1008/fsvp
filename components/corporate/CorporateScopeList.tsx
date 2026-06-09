import { CorporateScopeUploadTile, type SectionProgressProps } from "./CorporateScopeUploadTile";

type SupabaseLike = { from: (table: string) => any };

function bestStatus(statuses: string[]): string {
  if (statuses.includes("accepted"))      return "accepted";
  if (statuses.includes("under_review"))  return "under_review";
  if (statuses.includes("submitted"))     return "submitted";
  if (statuses.includes("needs_revision")) return "needs_revision";
  if (statuses.includes("rejected"))      return "rejected";
  return "not_submitted";
}

export async function CorporateScopeList({
  supplierId,
  supabase,
}: {
  supplierId: string | null;
  supabase: SupabaseLike;
}) {
  // Resolve the active published version
  const { data: pubVersion } = await (supabase.from("rule_versions") as any)
    .select("id")
    .eq("status", "published")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fallback: no rules engine configured yet — render static tiles with no progress
  if (!pubVersion?.id) {
    const fallbackItems = [
      { section_key: "supplier_legal_entity",        section_name: "Legal Entity and Ownership" },
      { section_key: "supplier_contacts",            section_name: "Primary Contacts" },
      { section_key: "supplier_questionnaire",       section_name: "Supplier Questionnaire" },
      { section_key: "supplier_food_safety_policy",  section_name: "Corporate Food Safety Policy" },
      { section_key: "supplier_recall_traceability", section_name: "Recall and Traceability Programs" },
      { section_key: "supplier_importer_assurances", section_name: "Importer Relationship and Written Assurances" },
    ];
    return (
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {fallbackItems.map((item) => (
          <CorporateScopeUploadTile
            key={item.section_key}
            sectionKey={item.section_key}
            label={item.section_name}
            supplierId={supplierId}
            progress={null}
          />
        ))}
      </div>
    );
  }

  // Fetch supplier sections, weights, items, and uploaded docs in parallel
  const [sectionsRes, weightsRes, itemsRes, docsRes] = await Promise.all([
    (supabase.from("requirement_sections") as any)
      .select("id, section_key, section_name, sort_order")
      .eq("rule_version_id", pubVersion.id)
      .eq("applies_to", "supplier")
      .order("sort_order"),

    (supabase.from("scoring_category_weights") as any)
      .select("section_id, weight_percent")
      .eq("rule_version_id", pubVersion.id),

    // We'll filter items by section after we have section ids
    (supabase.from("requirement_sections") as any)
      .select("id, requirement_items(id, is_required, is_critical_blocker)")
      .eq("rule_version_id", pubVersion.id)
      .eq("applies_to", "supplier"),

    supplierId
      ? (supabase.from("documents") as any)
          .select("requirement_item_id, evidence_status")
          .eq("supplier_id", supplierId)
          .is("soft_deleted_at", null)
          .not("requirement_item_id", "is", null)
      : Promise.resolve({ data: [] }),
  ]);

  const sections: Array<{ id: string; section_key: string; section_name: string }> =
    sectionsRes.data ?? [];

  const weightMap = new Map<string, number>(
    ((weightsRes.data ?? []) as Array<{ section_id: string; weight_percent: number }>)
      .map((w) => [w.section_id, Number(w.weight_percent)])
  );

  // Build item map from the joined query
  type RawSection = {
    id: string;
    requirement_items: Array<{ id: string; is_required: boolean; is_critical_blocker: boolean }>;
  };
  const itemsBySectionId = new Map<string, Array<{ id: string; is_critical_blocker: boolean }>>();
  for (const sec of (itemsRes.data ?? []) as RawSection[]) {
    const required = (sec.requirement_items ?? []).filter((i) => i.is_required);
    itemsBySectionId.set(sec.id, required);
  }

  const docByItemId = new Map<string, string[]>();
  for (const doc of (docsRes.data ?? []) as Array<{
    requirement_item_id: string | null;
    evidence_status: string | null;
  }>) {
    if (!doc.requirement_item_id) continue;
    const existing = docByItemId.get(doc.requirement_item_id) ?? [];
    existing.push(doc.evidence_status ?? "not_submitted");
    docByItemId.set(doc.requirement_item_id, existing);
  }

  // Compute progress per section
  const sectionData = sections.map((sec) => {
    const items = itemsBySectionId.get(sec.id) ?? [];
    let accepted = 0, submitted = 0, under_review = 0, needs_revision = 0, missing = 0;
    let has_critical_blocker = false;

    for (const item of items) {
      const status = bestStatus(docByItemId.get(item.id) ?? []);
      if (status === "accepted")      accepted++;
      else if (status === "under_review") under_review++;
      else if (status === "submitted")    submitted++;
      else if (status === "needs_revision") needs_revision++;
      else missing++;

      if (item.is_critical_blocker && status !== "accepted") has_critical_blocker = true;
    }

    const progress: SectionProgressProps = {
      required_count:       items.length,
      accepted_count:       accepted,
      submitted_count:      submitted,
      under_review_count:   under_review,
      needs_revision_count: needs_revision,
      missing_count:        missing,
      has_critical_blocker,
      weight_percent:       weightMap.get(sec.id) ?? 0,
    };

    return { ...sec, progress };
  });

  // If no supplier sections are seeded yet, show the fallback
  if (sectionData.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Corporate readiness requirements are not configured yet.
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {sectionData.map((sec) => (
        <CorporateScopeUploadTile
          key={sec.section_key}
          sectionKey={sec.section_key}
          label={sec.section_name}
          supplierId={supplierId}
          progress={sec.progress}
        />
      ))}
    </div>
  );
}
