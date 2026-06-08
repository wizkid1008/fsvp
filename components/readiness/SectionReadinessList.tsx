import { SectionProgressBar, type SectionProgress } from "@/components/evidence/SectionProgressBar";

type SupabaseLike = {
  from: (table: string) => any;
};

function bestStatus(statuses: string[]): string {
  if (statuses.includes("accepted")) return "accepted";
  if (statuses.includes("under_review")) return "under_review";
  if (statuses.includes("submitted")) return "submitted";
  if (statuses.includes("needs_revision")) return "needs_revision";
  if (statuses.includes("rejected")) return "rejected";
  return "not_submitted";
}

export async function SectionReadinessList({
  appliesTo,
  emptyText = "No readiness requirements are configured for this level yet.",
  supplierId,
  supabase,
  title
}: {
  appliesTo: "supplier" | "facility" | "product";
  emptyText?: string;
  supplierId?: string | null;
  supabase: SupabaseLike;
  title: string;
}) {
  const { data: pubVersion } = await (supabase.from("rule_versions") as any)
    .select("id")
    .eq("status", "published")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pubVersion?.id) {
    return null;
  }

  const { data: rawSections } = await (supabase.from("requirement_sections") as any)
    .select("id, section_key, section_name, applies_to, sort_order")
    .eq("rule_version_id", pubVersion.id)
    .eq("applies_to", appliesTo)
    .order("sort_order");

  const sectionIds = (rawSections ?? []).map((section: { id: string }) => section.id);
  const [weightsRes, itemsRes, docsRes] = await Promise.all([
    (supabase.from("scoring_category_weights") as any)
      .select("section_id, weight_percent")
      .eq("rule_version_id", pubVersion.id),
    sectionIds.length > 0
      ? (supabase.from("requirement_items") as any)
          .select("id, section_id, is_required, is_critical_blocker")
          .in("section_id", sectionIds)
          .eq("is_required", true)
      : Promise.resolve({ data: [] }),
    supplierId
      ? (supabase.from("documents") as any)
          .select("requirement_item_id, evidence_status")
          .eq("supplier_id", supplierId)
          .is("soft_deleted_at", null)
          .not("requirement_item_id", "is", null)
      : Promise.resolve({ data: [] })
  ]);

  const weightMap = new Map(
    ((weightsRes.data ?? []) as Array<{ section_id: string; weight_percent: number }>)
      .map((weight) => [weight.section_id, Number(weight.weight_percent)])
  );
  const itemsBySection = new Map<string, Array<{ id: string; is_critical_blocker: boolean }>>();
  for (const item of (itemsRes.data ?? []) as Array<{ id: string; section_id: string; is_critical_blocker: boolean }>) {
    const existing = itemsBySection.get(item.section_id) ?? [];
    existing.push(item);
    itemsBySection.set(item.section_id, existing);
  }

  const docByItemId = new Map<string, string[]>();
  for (const doc of (docsRes.data ?? []) as Array<{ requirement_item_id: string | null; evidence_status: string | null }>) {
    if (!doc.requirement_item_id) continue;
    const existing = docByItemId.get(doc.requirement_item_id) ?? [];
    existing.push(doc.evidence_status ?? "not_submitted");
    docByItemId.set(doc.requirement_item_id, existing);
  }

  const sectionProgress = ((rawSections ?? []) as Array<{
    id: string;
    section_key: string;
    section_name: string;
    applies_to: string;
  }>).map((section) => {
    const items = itemsBySection.get(section.id) ?? [];
    let accepted = 0;
    let submitted = 0;
    let under_review = 0;
    let needs_revision = 0;
    let missing = 0;
    let has_critical_blocker = false;

    for (const item of items) {
      const status = bestStatus(docByItemId.get(item.id) ?? []);
      if (status === "accepted") accepted++;
      else if (status === "under_review") under_review++;
      else if (status === "submitted") submitted++;
      else if (status === "needs_revision") needs_revision++;
      else missing++;

      if (item.is_critical_blocker && status !== "accepted") {
        has_critical_blocker = true;
      }
    }

    return {
      section_key: section.section_key,
      section_name: section.section_name,
      applies_to: section.applies_to,
      weight_percent: weightMap.get(section.id) ?? 0,
      required_count: items.length,
      accepted_count: accepted,
      submitted_count: submitted,
      under_review_count: under_review,
      needs_revision_count: needs_revision,
      missing_count: missing,
      has_critical_blocker
    } satisfies SectionProgress;
  });

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">
        Evidence must be accepted by a reviewer to count toward readiness.
      </p>
      {sectionProgress.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {sectionProgress.map((section) => (
            <SectionProgressBar key={section.section_key} section={section} />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          {emptyText}
        </p>
      )}
    </section>
  );
}
