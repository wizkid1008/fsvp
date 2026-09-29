import { RequirementItemRow } from "./RequirementItemRow";
import { fetchDetermination, recordCreationAction } from "@/lib/fsvp/applicability";
import { tryAdminClient } from "@/lib/supabase/admin-guard";
import { EvidenceBreakdown } from "./EvidenceProgressCell";
import { OtherDocumentUpload } from "./OtherDocumentUpload";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { documentLabel, documentTone } from "@/lib/evidence/document-status";
import {
  bestStatus,
  evidenceProgress,
  generatedItemStatus,
  RELATIONSHIP_SCOPE,
  statusesByItem,
  type EvidenceViewer,
} from "@/lib/readiness/evidence-scope";

type SupabaseLike = { from: (table: string) => any };

// bestStatus and the scope rules now live in lib/readiness/evidence-scope.ts,
// which lib/readiness/supplier-score.ts also calls — the list and the number
// above it have to agree about what satisfies a requirement, and two copies of
// that judgement is how they stop agreeing.

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
  importerId = null,
}: {
  linkType: "supplier" | "facility" | "product";
  /** The supplier id when linkType is "supplier" — the company IS the entity. */
  entityId: string;
  supplierId: string;
  supabase: SupabaseLike;
  allowGeneratedActions?: boolean;
  /**
   * The viewing importer, when there is one. Only used to work out ahead of
   * time whether "Create" can succeed — without it the button is offered as
   * before, which is no worse than not knowing.
   */
  importerId?: string | null;
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

  // With an importer viewing, documents are "filed for this importer, or for
  // nobody in particular" — the rule lib/readiness/evidence-progress.ts applies
  // on the list pages, so the counts at the top here match the row clicked.
  const scopeDocs = (query: any) =>
    importerId ? query.or(`importer_id.eq.${importerId},importer_id.is.null`) : query;

  // Every document filed against this entity, by the same columns the required
  // rows read below — used for the "Other documents" list, which holds the
  // uploads that answer no required item.
  const entityDocs = (columns: string) => {
    const base = (supabase.from("documents") as any).select(columns).is("soft_deleted_at", null);
    return scopeDocs(
      linkType === "supplier" ? base.eq("supplier_id", entityId)
      : linkType === "facility" ? base.eq("facility_id", entityId)
      : base.eq("linked_entity_type", "product").eq("linked_entity_id", entityId)
    );
  };

  const [sectionsRes, itemsRes, docsRes, fsvpRecordRes, otherDocsRes] = await Promise.all([
    (supabase.from("requirement_sections") as any)
      .select("id, section_key, section_name, sort_order")
      .eq("rule_version_id", pubVersion.id)
      .eq("applies_to", linkType)
      .order("sort_order"),

    (supabase.from("requirement_sections") as any)
      .select("id, requirement_items(id, item_key, item_name, is_required, is_critical_blocker, sort_order, evidence_scope, evidence_type)")
      .eq("rule_version_id", pubVersion.id)
      .eq("applies_to", linkType),

    // Company-level evidence hangs off supplier_id rather than a linked entity,
    // which is the same column lib/readiness/supplier-score.ts counts — so the
    // list and the score above it cannot disagree. importer_id comes along
    // because migration 028 makes two of the supplier items answerable only by
    // the importer they were filed for.
    linkType === "supplier"
      ? scopeDocs((supabase.from("documents") as any)
          .select("requirement_item_id, evidence_status, importer_id")
          .eq("supplier_id", entityId)
          .is("soft_deleted_at", null)
          .not("requirement_item_id", "is", null))
    : linkType === "facility"
      ? scopeDocs((supabase.from("documents") as any)
          .select("requirement_item_id, evidence_status, importer_id")
          .eq("facility_id", entityId)
          .is("soft_deleted_at", null)
          .not("requirement_item_id", "is", null))
      : scopeDocs((supabase.from("documents") as any)
          .select("requirement_item_id, evidence_status, importer_id")
          .eq("linked_entity_type", "product")
          .eq("linked_entity_id", entityId)
          .is("soft_deleted_at", null)
          .not("requirement_item_id", "is", null)),

    linkType === "product"
      ? (supabase.from("fsvp_records") as any)
          .select("id")
          .eq("product_id", entityId)
          .eq("supplier_id", supplierId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    // A supplier's company-level documents hang off supplier_id, but so does
    // every facility and product document that exporter files — only those
    // the upload route filed as linked_entity_type "supplier" are the company's own.
    (linkType === "supplier"
      ? entityDocs("id, title, evidence_status, uploaded_at").eq("linked_entity_type", "supplier")
      : entityDocs("id, title, evidence_status, uploaded_at"))
      .is("requirement_item_id", null)
      .order("uploaded_at", { ascending: false }),
  ]);

  const otherDocuments = (otherDocsRes.data ?? []) as Array<{
    id: string; title: string | null; evidence_status: string | null; uploaded_at: string | null;
  }>;
  const otherDocumentsBlock = (
    <div className="space-y-3">
      {otherDocuments.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="border-b border-line bg-slate-50 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Other documents</p>
            <p className="mt-0.5 text-xs normal-case text-slate-400">Not on the required list, so they do not count toward it.</p>
          </div>
          {otherDocuments.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
              <a
                href={`/api/documents/download?id=${doc.id}`}
                className="min-w-0 flex-1 truncate text-sm font-medium text-forest hover:underline"
              >
                {doc.title ?? "Untitled document"}
              </a>
              {doc.uploaded_at && (
                <span className="text-xs text-slate-400">{new Date(doc.uploaded_at).toLocaleDateString()}</span>
              )}
              <StatusBadge tone={documentTone(doc.evidence_status)}>{documentLabel(doc.evidence_status)}</StatusBadge>
            </div>
          ))}
        </div>
      )}
      <OtherDocumentUpload linkType={linkType} entityId={entityId} supplierId={supplierId} viewerImporterId={importerId} />
    </div>
  );

  const sections: Array<{ id: string; section_key: string; section_name: string }> = sectionsRes.data ?? [];

  type RawItem = {
    id: string; item_key: string; item_name: string; is_required: boolean;
    is_critical_blocker: boolean; sort_order: number; evidence_scope?: string | null;
    evidence_type?: string | null;
  };
  type RawSec = { id: string; requirement_items: RawItem[] };

  const itemsBySectionId = new Map<string, RawItem[]>();
  for (const sec of (itemsRes.data ?? []) as RawSec[]) {
    const sorted = [...(sec.requirement_items ?? [])]
      .filter((i) => i.is_required)
      .sort((a, b) => a.sort_order - b.sort_order);
    itemsBySectionId.set(sec.id, sorted);
  }

  /**
   * Who is asking. An importer asks about its own relationship; the exporter
   * reading its own readiness has no single counterparty, so relationship items
   * are judged across every importer it serves.
   *
   * Only supplier requirements are ever relationship-scoped, so the extra query
   * is confined to that case.
   */
  let viewer: EvidenceViewer = importerId
    ? { kind: "importer", importerId }
    : { kind: "exporter", linkedImporterIds: [] };

  /**
   * The importers an exporter can file a relationship document FOR. Empty for
   * an importer's own view, where the answer is simply itself.
   */
  let importerOptions: Array<{ id: string; name: string }> = [];

  if (linkType === "supplier" && !importerId) {
    const { data: links } = await (supabase.from("supplier_relationships") as any)
      .select("importer_id")
      .eq("relationship_type", "importer_supplier")
      .eq("supplier_id", entityId)
      .in("status", ["active", "pending_invite"]);

    const linkedIds = [...new Set(
      ((links ?? []) as Array<{ importer_id: string | null }>)
        .map((link) => link.importer_id)
        .filter((id): id is string => Boolean(id))
    )];

    viewer = { kind: "exporter", linkedImporterIds: linkedIds };

    /**
     * Names come through the admin client, and only because RLS cannot supply
     * them: importers_tenant_read exposes an importer only to itself, so an
     * exporter reading its own readiness cannot see the name of a company it
     * supplies. Embedding importers(display_name) on the query above returns
     * null for every row and the picker below would offer "Unnamed importer"
     * several times over — useless in exactly the case it exists for.
     *
     * Tenancy is therefore re-applied by hand, and deliberately narrowly: only
     * ids drawn from THIS supplier's own active relationships, and only
     * display_name. The importers row also carries ein, duns_number,
     * address_json and stripe_customer_id, none of which an exporter has any
     * business reading — which is why this is a two-column lookup rather than a
     * new RLS policy granting exporters the row.
     */
    if (linkedIds.length > 1) {
      const adminResult = tryAdminClient();
      if (adminResult.ok) {
        const { data: importerRows } = await (adminResult.client.from("importers") as any)
          .select("id, display_name")
          .in("id", linkedIds);

        importerOptions = ((importerRows ?? []) as Array<{ id: string; display_name: string | null }>)
          .map((row) => ({ id: row.id, name: row.display_name ?? "Unnamed importer" }));
      }
    }
  }

  const docByItemId = statusesByItem(
    [...itemsBySectionId.values()].flat(),
    (docsRes.data ?? []) as Array<{
      requirement_item_id: string | null;
      evidence_status: string | null;
      importer_id: string | null;
    }>,
    viewer
  );

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

  /**
   * What applicability says about this product, worked out here rather than
   * discovered by clicking.
   *
   * Usually this is a notice rather than a wall: an undetermined pair may
   * still be drafted against, and Create stays. Only an EXEMPT determination
   * stops the record, because § 1.501 says an exempt food does not need one —
   * see lib/fsvp/applicability.ts for why the two are not the same thing.
   *
   * Only asked when there is no record yet: an existing one is opened by the
   * button rather than created, so nothing about it is conditional on this.
   */
  const creationBlock =
    linkType === "product" && allowGeneratedActions && !fsvpRecordId && importerId
      ? recordCreationAction(
          await fetchDetermination(supabase, importerId, supplierId, entityId)
        )
      : null;

  // Shared with lib/readiness/evidence-progress.ts, so the list counts on the
  // products table agree with this checklist.
  function generatedStatusFor(item: RawItem): string | null {
    if (linkType !== "product" || !hazardAnalysis) return null;
    return generatedItemStatus(item.item_key, {
      status: hazardAnalysis.status,
      itemCount: (hazardAnalysis.fsvp_plan_hazard_items ?? []).length,
    });
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
      blocked: creationBlock,
    };
  }

  const sectionsWithItems = sections
    .map((sec) => ({ ...sec, items: itemsBySectionId.get(sec.id) ?? [] }))
    .filter((sec) => sec.items.length > 0);

  if (sectionsWithItems.length === 0) {
    return (
      <div className="mt-4 space-y-4">
        <p className="rounded-md border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No specific documents are required for this {linkType} yet.
        </p>
        {otherDocumentsBlock}
      </div>
    );
  }

  // The four counts the list row and the dashboard show, from the same statuses
  // the rows below render — the last step of the drill-down cannot disagree
  // with the step before it, or with itself.
  const requiredItems = sectionsWithItems.flatMap((sec) => sec.items);
  const summary = evidenceProgress(
    requiredItems,
    new Map(requiredItems.map((item): [string, string[]] => {
      const generated = generatedStatusFor(item);
      return [item.id, generated ? [generated] : docByItemId.get(item.id) ?? []];
    }))
  );

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-line bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium text-slate-500">
          {summary.required} required document{summary.required === 1 ? "" : "s"}
        </p>
        <div className="mt-2">
          <EvidenceBreakdown progress={summary} />
        </div>
      </div>
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
              // An assurance is given to ONE importer, so when the exporter
              // serves several the row has to ask which — otherwise the upload
              // arrives with no importer named and satisfies nobody.
              isRelationshipScoped={item.evidence_scope === RELATIONSHIP_SCOPE}
              importerOptions={importerOptions}
              // Contacts and the questionnaire are answered in the app, not
              // uploaded — see 006_evidence_forms.sql.
              isForm={item.evidence_type === "form"}
              viewerImporterId={importerId}
            />
          ))}
        </div>
      ))}
      {otherDocumentsBlock}
    </div>
  );
}
