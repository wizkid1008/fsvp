import { CorporateScopeUploadTile, type SectionProgressProps, type RequirementItem } from "./CorporateScopeUploadTile";
import { CorporateContactsSection, type ContactJson } from "./CorporateContactsSection";

type SupabaseLike = { from: (table: string) => any };

const FALLBACK_SECTIONS = [
  {
    section_key:  "supplier_legal_entity",
    section_name: "Legal Entity and Ownership",
    description:  "Document the legal structure, registration, and ownership of the exporting entity.",
    items: [
      { id: "fallback-legal-1", item_name: "Legal Entity Documentation", description: "Articles of incorporation, business registration, or equivalent government-issued document proving the entity's legal status.", is_critical_blocker: true,  status: "not_submitted" },
      { id: "fallback-legal-2", item_name: "Ownership Structure",        description: "Org chart or declaration showing the ownership hierarchy of the exporting company.",                                              is_critical_blocker: false, status: "not_submitted" },
    ],
  },
  {
    section_key:  "supplier_contacts",
    section_name: "Primary Contacts",
    description:  "Identify key contacts for food safety, quality, and regulatory correspondence.",
    items: [
      { id: "fallback-contact-1", item_name: "Primary Contact Information",      description: "Name, title, email, and phone for the main point of contact.",                      is_critical_blocker: false, status: "not_submitted" },
      { id: "fallback-contact-2", item_name: "Regulatory / Quality Contact",     description: "Dedicated contact for regulatory inquiries and food safety matters.",               is_critical_blocker: false, status: "not_submitted" },
    ],
  },
  {
    section_key:  "supplier_questionnaire",
    section_name: "Supplier Questionnaire",
    description:  "Complete the FSVP supplier self-assessment questionnaire.",
    items: [
      { id: "fallback-q-1", item_name: "Completed Supplier Questionnaire", description: "Signed and completed FSVP supplier self-assessment form.", is_critical_blocker: true, status: "not_submitted" },
    ],
  },
  {
    section_key:  "supplier_food_safety_policy",
    section_name: "Corporate Food Safety Policy",
    description:  "Provide the signed corporate food safety policy and management commitment.",
    items: [
      { id: "fallback-fsp-1", item_name: "Corporate Food Safety Policy",    description: "Current signed corporate food safety policy document.",                     is_critical_blocker: true,  status: "not_submitted" },
      { id: "fallback-fsp-2", item_name: "Management Commitment Statement", description: "Signed letter or statement from senior management committing to food safety.", is_critical_blocker: false, status: "not_submitted" },
    ],
  },
  {
    section_key:  "supplier_recall_traceability",
    section_name: "Recall and Traceability Programs",
    description:  "Document recall procedures and lot traceability controls.",
    items: [
      { id: "fallback-rt-1", item_name: "Recall Plan",            description: "Written recall procedure including notification, retrieval, and disposition steps.", is_critical_blocker: true,  status: "not_submitted" },
      { id: "fallback-rt-2", item_name: "Traceability Program",   description: "Lot coding, recordkeeping, and one-up/one-down traceability documentation.",         is_critical_blocker: false, status: "not_submitted" },
    ],
  },
  {
    section_key:  "supplier_importer_assurances",
    section_name: "Importer Relationship and Written Assurances",
    description:  "Provide signed written assurances as required under 21 CFR 1.506(e)(2).",
    items: [
      { id: "fallback-ia-1", item_name: "Written Assurances / Supplier Agreement", description: "Signed written assurance that the supplier will produce food in compliance with applicable FDA requirements.", is_critical_blocker: true,  status: "not_submitted" },
      { id: "fallback-ia-2", item_name: "Importer Acknowledgement",                description: "Signed acknowledgement from the importer accepting responsibility under 21 CFR Part 1 Subpart L.",            is_critical_blocker: false, status: "not_submitted" },
    ],
  },
];

export async function CorporateScopeList({
  supplierId,
  supabase,
  contactJson = {},
}: {
  supplierId:   string | null;
  supabase:     SupabaseLike;
  contactJson?: ContactJson;
}) {
  const { data: pubVersion } = await (supabase.from("rule_versions") as any)
    .select("id")
    .eq("status", "published")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pubVersion?.id) {
    return (
      <div className="mt-4 overflow-hidden rounded-lg border border-line divide-y divide-line">
        {FALLBACK_SECTIONS.map((sec) => {
          if (sec.section_key === "supplier_contacts") {
            return (
              <CorporateContactsSection key={sec.section_key} contactJson={contactJson} />
            );
          }
          const progress: SectionProgressProps = {
            required_count:       sec.items.length,
            accepted_count:       0,
            submitted_count:      0,
            under_review_count:   0,
            needs_revision_count: 0,
            missing_count:        sec.items.length,
            has_critical_blocker: sec.items.some((i) => i.is_critical_blocker),
            weight_percent:       0,
          };
          return (
            <CorporateScopeUploadTile
              key={sec.section_key}
              sectionKey={sec.section_key}
              label={sec.section_name}
              description={sec.description}
              items={sec.items}
              supplierId={supplierId}
              progress={progress}
            />
          );
        })}
      </div>
    );
  }

  const [sectionsRes, weightsRes, itemsRes, docsRes] = await Promise.all([
    (supabase.from("requirement_sections") as any)
      .select("id, section_key, section_name, description, sort_order")
      .eq("rule_version_id", pubVersion.id)
      .eq("applies_to", "supplier")
      .order("sort_order"),

    (supabase.from("scoring_category_weights") as any)
      .select("section_id, weight_percent")
      .eq("rule_version_id", pubVersion.id),

    (supabase.from("requirement_sections") as any)
      .select("id, requirement_items(id, item_name, description, is_required, is_critical_blocker, sort_order)")
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

  type RawItem = {
    id: string;
    item_name: string;
    description: string | null;
    is_required: boolean;
    is_critical_blocker: boolean;
    sort_order: number;
  };
  type RawSec = { id: string; requirement_items: RawItem[] };

  const itemsBySectionId = new Map<string, RawItem[]>();
  for (const sec of (itemsRes.data ?? []) as RawSec[]) {
    const sorted = [...(sec.requirement_items ?? [])]
      .filter((i) => i.is_required)
      .sort((a, b) => a.sort_order - b.sort_order);
    itemsBySectionId.set(sec.id, sorted);
  }

  // Best status per item_id (take the most favorable document status)
  const STATUS_RANK: Record<string, number> = {
    accepted: 5, under_review: 4, submitted: 3, needs_revision: 2, rejected: 1, not_submitted: 0,
  };
  const docStatusByItemId = new Map<string, string>();
  for (const doc of (docsRes.data ?? []) as Array<{ requirement_item_id: string | null; evidence_status: string | null }>) {
    if (!doc.requirement_item_id) continue;
    const incoming = doc.evidence_status ?? "not_submitted";
    const existing = docStatusByItemId.get(doc.requirement_item_id) ?? "not_submitted";
    if ((STATUS_RANK[incoming] ?? 0) > (STATUS_RANK[existing] ?? 0)) {
      docStatusByItemId.set(doc.requirement_item_id, incoming);
    }
  }

  if (sections.length === 0) {
    return (
      <p className="mt-4 rounded-md border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Corporate readiness requirements are not configured yet.
      </p>
    );
  }

  const sectionData = sections.map((sec) => {
    const rawItems = itemsBySectionId.get(sec.id) ?? [];

    const items: RequirementItem[] = rawItems.map((i) => ({
      id:                  i.id,
      item_name:           i.item_name,
      description:         i.description ?? null,
      is_critical_blocker: i.is_critical_blocker,
      status:              docStatusByItemId.get(i.id) ?? "not_submitted",
    }));

    let accepted = 0, submitted = 0, under_review = 0, needs_revision = 0, missing = 0;
    let has_critical_blocker = false;
    for (const item of items) {
      if (item.status === "accepted")        accepted++;
      else if (item.status === "under_review") under_review++;
      else if (item.status === "submitted")    submitted++;
      else if (item.status === "needs_revision") needs_revision++;
      else missing++;
      if (item.is_critical_blocker && item.status !== "accepted") has_critical_blocker = true;
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

    const fallback = FALLBACK_SECTIONS.find((f) => f.section_key === sec.section_key);
    const description = sec.description ?? fallback?.description ?? "";

    return { ...sec, items, progress, description };
  });

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line divide-y divide-line">
      {sectionData.map((sec) => {
        if (sec.section_key === "supplier_contacts") {
          return (
            <CorporateContactsSection key={sec.section_key} contactJson={contactJson} />
          );
        }
        return (
          <CorporateScopeUploadTile
            key={sec.section_key}
            sectionKey={sec.section_key}
            label={sec.section_name}
            description={sec.description}
            items={sec.items}
            supplierId={supplierId}
            progress={sec.progress}
          />
        );
      })}
    </div>
  );
}
