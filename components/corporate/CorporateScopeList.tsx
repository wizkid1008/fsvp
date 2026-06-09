import { CorporateScopeUploadTile, type SectionProgressProps } from "./CorporateScopeUploadTile";

type SupabaseLike = { from: (table: string) => any };

// Fallback static data used when no published rule version exists
const FALLBACK_SECTIONS = [
  {
    section_key:   "supplier_legal_entity",
    section_name:  "Legal Entity and Ownership",
    description:   "Document the legal structure, registration, and ownership of the exporting entity.",
    requiredItems: "Legal entity documentation, ownership structure",
  },
  {
    section_key:   "supplier_contacts",
    section_name:  "Primary Contacts",
    description:   "Identify key contacts for food safety, quality, and regulatory correspondence.",
    requiredItems: "Primary contact information, regulatory / quality contact",
  },
  {
    section_key:   "supplier_questionnaire",
    section_name:  "Supplier Questionnaire",
    description:   "Complete the FSVP supplier self-assessment questionnaire.",
    requiredItems: "Completed supplier questionnaire",
  },
  {
    section_key:   "supplier_food_safety_policy",
    section_name:  "Corporate Food Safety Policy",
    description:   "Provide the signed corporate food safety policy and management commitment.",
    requiredItems: "Corporate food safety policy, management commitment statement",
  },
  {
    section_key:   "supplier_recall_traceability",
    section_name:  "Recall and Traceability Programs",
    description:   "Document recall procedures and lot traceability controls.",
    requiredItems: "Recall plan, traceability program",
  },
  {
    section_key:   "supplier_importer_assurances",
    section_name:  "Importer Relationship and Written Assurances",
    description:   "Provide signed written assurances as required under 21 CFR 1.506(e)(2).",
    requiredItems: "Written assurances / supplier agreement, importer acknowledgement",
  },
];

function bestStatus(statuses: string[]): string {
  if (statuses.includes("accepted"))       return "accepted";
  if (statuses.includes("under_review"))   return "under_review";
  if (statuses.includes("submitted"))      return "submitted";
  if (statuses.includes("needs_revision")) return "needs_revision";
  if (statuses.includes("rejected"))       return "rejected";
  return "not_submitted";
}

export async function CorporateScopeList({
  supplierId,
  supabase,
}: {
  supplierId: string | null;
  supabase:   SupabaseLike;
}) {
  // Resolve the active published version
  const { data: pubVersion } = await (supabase.from("rule_versions") as any)
    .select("id")
    .eq("status", "published")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── Fallback ──────────────────────────────────────────────
  if (!pubVersion?.id) {
    return (
      <div className="mt-4 overflow-hidden rounded-lg border border-line divide-y divide-line">
        {FALLBACK_SECTIONS.map((sec) => (
          <CorporateScopeUploadTile
            key={sec.section_key}
            sectionKey={sec.section_key}
            label={sec.section_name}
            description={sec.description}
            requiredItems={sec.requiredItems}
            supplierId={supplierId}
            progress={null}
          />
        ))}
      </div>
    );
  }

  // ── Live DB queries ───────────────────────────────────────
  const [sectionsRes, weightsRes, itemsRes, docsRes] = await Promise.all([
    // Sections with description
    (supabase.from("requirement_sections") as any)
      .select("id, section_key, section_name, description, sort_order")
      .eq("rule_version_id", pubVersion.id)
      .eq("applies_to", "supplier")
      .order("sort_order"),

    // Weights
    (supabase.from("scoring_category_weights") as any)
      .select("section_id, weight_percent")
      .eq("rule_version_id", pubVersion.id),

    // Items (with name for "Required:" line)
    (supabase.from("requirement_sections") as any)
      .select("id, requirement_items(id, item_name, is_required, is_critical_blocker, sort_order)")
      .eq("rule_version_id", pubVersion.id)
      .eq("applies_to", "supplier"),

    // Uploaded docs for this supplier
    supplierId
      ? (supabase.from("documents") as any)
          .select("requirement_item_id, evidence_status")
          .eq("supplier_id", supplierId)
          .is("soft_deleted_at", null)
          .not("requirement_item_id", "is", null)
      : Promise.resolve({ data: [] }),
  ]);

  const sections: Array<{
    id: string;
    section_key: string;
    section_name: string;
    description: string | null;
  }> = sectionsRes.data ?? [];

  const weightMap = new Map<string, number>(
    ((weightsRes.data ?? []) as Array<{ section_id: string; weight_percent: number }>)
      .map((w) => [w.section_id, Number(w.weight_percent)])
  );

  type RawItem = { id: string; item_name: string; is_required: boolean; is_critical_blocker: boolean; sort_order: number };
  type RawSec  = { id: string; requirement_items: RawItem[] };

  const itemsBySectionId = new Map<string, RawItem[]>();
  for (const sec of (itemsRes.data ?? []) as RawSec[]) {
    const sorted = [...(sec.requirement_items ?? [])]
      .filter((i) => i.is_required)
      .sort((a, b) => a.sort_order - b.sort_order);
    itemsBySectionId.set(sec.id, sorted);
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

  if (sections.length === 0) {
    return (
      <p className="mt-4 rounded-md border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Corporate readiness requirements are not configured yet.
      </p>
    );
  }

  // Compute per-section progress
  const sectionData = sections.map((sec) => {
    const items = itemsBySectionId.get(sec.id) ?? [];
    let accepted = 0, submitted = 0, under_review = 0, needs_revision = 0, missing = 0;
    let has_critical_blocker = false;

    for (const item of items) {
      const status = bestStatus(docByItemId.get(item.id) ?? []);
      if (status === "accepted")        accepted++;
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

    const requiredItems = items.map((i) => i.item_name).join(", ");

    // Fallback description if DB description is empty
    const fallback = FALLBACK_SECTIONS.find((f) => f.section_key === sec.section_key);
    const description = sec.description ?? fallback?.description ?? "";

    return { ...sec, progress, requiredItems, description };
  });

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line divide-y divide-line">
      {sectionData.map((sec) => (
        <CorporateScopeUploadTile
          key={sec.section_key}
          sectionKey={sec.section_key}
          label={sec.section_name}
          description={sec.description}
          requiredItems={sec.requiredItems}
          supplierId={supplierId}
          progress={sec.progress}
        />
      ))}
    </div>
  );
}
