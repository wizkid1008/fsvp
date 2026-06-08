import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EvidenceReviewPanel } from "@/components/evidence/EvidenceReviewPanel";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

export default async function ReviewerPage() {
  const { role } = await requireProfileRole("/reviewer", ["reviewer", "administrator"]);
  const supabase = createServerSupabaseClient();

  // Fetch all non-deleted documents that need review (submitted or under_review)
  // plus accepted/rejected for the last 30 days so reviewers can see context
  const { data: rawDocs } = await (supabase.from("documents") as any)
    .select(`
      id, title, document_kind, original_filename, uploaded_at,
      evidence_status, review_notes, expiration_date,
      linked_entity_type, requirement_item_id, supplier_id,
      uploaded_by_profile_id
    `)
    .is("soft_deleted_at", null)
    .in("evidence_status", ["submitted", "under_review", "needs_revision", "accepted", "rejected"])
    .order("uploaded_at", { ascending: false });

  const docs = (rawDocs ?? []) as Array<{
    id: string;
    title: string;
    document_kind: string;
    original_filename: string | null;
    uploaded_at: string;
    evidence_status: string;
    review_notes: string | null;
    expiration_date: string | null;
    linked_entity_type: string | null;
    requirement_item_id: string | null;
    supplier_id: string | null;
    uploaded_by_profile_id: string | null;
  }>;

  // Fetch supporting data in parallel
  const supplierIds = [...new Set(docs.map((d) => d.supplier_id).filter(Boolean))] as string[];
  const itemIds = [...new Set(docs.map((d) => d.requirement_item_id).filter(Boolean))] as string[];
  const profileIds = [...new Set(docs.map((d) => d.uploaded_by_profile_id).filter(Boolean))] as string[];

  const [suppliersRes, itemsRes, profilesRes] = await Promise.all([
    supplierIds.length > 0
      ? (supabase.from("suppliers") as any).select("id, company_name").in("id", supplierIds)
      : Promise.resolve({ data: [] }),
    itemIds.length > 0
      ? (supabase.from("requirement_items") as any).select("id, item_name").in("id", itemIds)
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? (supabase.from("profiles") as any).select("id, full_name, email").in("id", profileIds)
      : Promise.resolve({ data: [] }),
  ]);

  const supplierMap = new Map(
    ((suppliersRes.data ?? []) as Array<{ id: string; company_name: string }>)
      .map((s) => [s.id, s.company_name])
  );
  const itemMap = new Map(
    ((itemsRes.data ?? []) as Array<{ id: string; item_name: string }>)
      .map((i) => [i.id, i.item_name])
  );
  const profileMap = new Map(
    ((profilesRes.data ?? []) as Array<{ id: string; full_name: string | null; email: string }>)
      .map((p) => [p.id, p.full_name || p.email])
  );

  // Group documents by supplier
  const groupMap = new Map<string, { supplier_id: string; supplier_name: string; documents: typeof docs }>();

  for (const doc of docs) {
    const sid = doc.supplier_id ?? "unknown";
    const name = supplierMap.get(sid) ?? "Unknown Supplier";
    if (!groupMap.has(sid)) {
      groupMap.set(sid, { supplier_id: sid, supplier_name: name, documents: [] });
    }
    groupMap.get(sid)!.documents.push(doc);
  }

  const groups = Array.from(groupMap.values()).map((g) => ({
    ...g,
    documents: g.documents.map((d) => ({
      id: d.id,
      title: d.title,
      document_kind: d.document_kind,
      original_filename: d.original_filename,
      uploaded_at: d.uploaded_at,
      evidence_status: d.evidence_status as any,
      review_notes: d.review_notes,
      expiration_date: d.expiration_date,
      linked_entity_type: d.linked_entity_type,
      requirement_item_name: d.requirement_item_id ? itemMap.get(d.requirement_item_id) ?? null : null,
      uploaded_by_name: d.uploaded_by_profile_id ? profileMap.get(d.uploaded_by_profile_id) ?? null : null,
    })),
  }));

  const pendingTotal = docs.filter(
    (d) => d.evidence_status === "submitted" || d.evidence_status === "under_review"
  ).length;
  const acceptedTotal = docs.filter((d) => d.evidence_status === "accepted").length;

  const metricTone = (v: number, warnAbove = 0): StatusTone =>
    v === 0 ? "neutral" : v > warnAbove ? "warning" : "success";

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Evidence Review Queue"
        description="Review submitted supplier evidence, accept documents that meet requirements, request revisions, or reject non-compliant submissions."
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Pending Review", value: pendingTotal, tone: metricTone(pendingTotal, 0) as StatusTone },
          { label: "Accepted (visible)", value: acceptedTotal, tone: "success" as StatusTone },
          { label: "Suppliers with Evidence", value: groups.length, tone: "info" as StatusTone },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-line bg-white p-4 shadow-soft">
            <p className="text-xs font-medium text-slate-500">{m.label}</p>
            <div className="mt-2 flex items-end justify-between">
              <p className="text-3xl font-semibold text-ink">{m.value}</p>
              <StatusBadge tone={m.tone}>{m.value > 0 ? "Active" : "None"}</StatusBadge>
            </div>
          </div>
        ))}
      </div>

      <EvidenceReviewPanel groups={groups} />
    </AppShell>
  );
}
