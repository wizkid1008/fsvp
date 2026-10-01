import { CheckCircle2, CircleAlert, FileText } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ImporterRecordUpload } from "@/components/evidence/ImporterRecordUpload";
import { ProcedureEditor } from "@/components/evidence/ProcedureEditor";
import {
  outstandingRequired,
  summariseImporterRecords,
  type ImporterRecordStatus,
} from "@/lib/fsvp/importer-records";
import { PROCEDURE_KINDS } from "@/lib/fsvp/procedure-draft";
import type { StatusTone } from "@/types/platform";

/**
 * The importer's own FSVP documents, as the Company records tab of the
 * Document Library.
 *
 * Every other evidence screen is about a foreign supplier. These establish that
 * an FSVP exists at all — the § 1.506(b) written procedures, the § 1.503
 * qualifications behind each signature, the § 1.510 records procedures — and
 * they are what an investigator asks for before opening any single record.
 *
 * They used to have a page of their own, Our FSVP Records, beside the Document
 * Library. Two places to look for "our documents" was one too many; they are a
 * tab of the library now, and /our-records redirects here.
 */

/** Obligations the importer writes about its own process, so they are drafted
 *  and edited in place rather than uploaded. Taken from the drafters rather
 *  than restated, so this tab cannot offer an editor for something the API
 *  has no way to draft. */
const EDITABLE_PROCEDURES = PROCEDURE_KINDS;

type CompanyDocument = {
  id: string;
  title: string;
  document_kind: string | null;
  original_filename: string | null;
  uploaded_at: string;
  evidence_status: string | null;
  expiration_date: string | null;
};

type Procedure = {
  kind: string;
  content: string;
  status: "draft" | "adopted";
  version: number;
  adopted_at: string | null;
  profiles: { full_name: string | null; email: string } | null;
};

export type CompanyRecordsData = {
  documents: CompanyDocument[];
  procedures: Procedure[];
  summary: ImporterRecordStatus[];
  /** Required records not yet in place — the count on the tab. */
  outstanding: number;
  /** The organization's D-U-N-S, the § 1.509 importer identifier, if on file. */
  dunsNumber: string | null;
};

export async function loadCompanyRecords(
  supabase: { from: (table: string) => any },
  importerId: string
): Promise<CompanyRecordsData> {
  const [docsRes, proceduresRes, importerRes] = await Promise.all([
    supabase.from("documents")
      .select("id, title, document_kind, original_filename, uploaded_at, evidence_status, expiration_date")
      .eq("linked_entity_type", "importer")
      .eq("linked_entity_id", importerId)
      .is("soft_deleted_at", null)
      .order("uploaded_at", { ascending: false }),
    // Two of the obligations are procedures the importer writes about its own
    // process, so they live as editable versioned records rather than uploaded
    // files — see migration 021.
    supabase.from("importer_procedures")
      .select("kind, content, status, version, adopted_at, profiles:adopted_by_profile_id(full_name, email)")
      .eq("importer_id", importerId)
      .in("status", ["draft", "adopted"]),
    supabase.from("importers").select("duns_number").eq("id", importerId).maybeSingle(),
  ]);

  const documents = (docsRes.data ?? []) as CompanyDocument[];
  const procedures = (proceduresRes.data ?? []) as Procedure[];

  // An adopted procedure satisfies its obligation the way an accepted document
  // does, so the summary counts both rather than reporting a gap that is filled.
  const adoptedKinds = procedures.filter((p) => p.status === "adopted").map((p) => p.kind);
  const summary = summariseImporterRecords(documents).map((s) =>
    adoptedKinds.includes(s.kind.key) ? { ...s, satisfied: true } : s
  );

  return {
    documents,
    procedures,
    summary,
    outstanding: outstandingRequired(summary),
    dunsNumber: (importerRes.data as { duns_number: string | null } | null)?.duns_number ?? null,
  };
}

const statusTone = (s: string | null): StatusTone =>
  s === "accepted" ? "success"
  : s === "rejected" || s === "needs_revision" ? "danger"
  : s === "submitted" || s === "under_review" ? "warning"
  : "neutral";

export function CompanyRecords({
  data,
  importerId,
  isAdministrator,
}: {
  data: CompanyRecordsData;
  importerId: string;
  isAdministrator: boolean;
}) {
  const { documents, procedures, summary } = data;

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm leading-6 text-slate-600">
        Documents about your own FSVP program rather than about a supplier. Each is held once and
        covers every product you import, and an FDA investigator usually asks for these first.
      </p>

      {summary.map(({ kind, documents: count, satisfied }) => {
        const filed = documents.filter((d) => d.document_kind === kind.key);
        const editable = EDITABLE_PROCEDURES.includes(kind.key);

        // A kind can hold both a draft and an adopted version at once —
        // editing an adopted procedure opens a draft while the adopted text
        // stays in force. The draft is what you work on, so it wins here.
        const forKind = procedures.filter((p) => p.kind === kind.key);
        const live =
          forKind.find((p) => p.status === "draft") ??
          forKind.find((p) => p.status === "adopted") ??
          null;

        return (
          <section key={kind.key} className="rounded-lg border border-line bg-white shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="flex min-w-0 gap-3">
                {satisfied
                  ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  : <CircleAlert className={`mt-0.5 h-5 w-5 shrink-0 ${kind.required ? "text-amber-500" : "text-slate-300"}`} />}
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-ink">{kind.title}</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">{kind.citation}</p>
                  <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">{kind.why}</p>
                </div>
              </div>
              <StatusBadge tone={satisfied ? "success" : kind.required ? "warning" : "neutral"}>
                {satisfied ? "On file" : kind.required ? "Required" : "If applicable"}
              </StatusBadge>
            </div>

            {filed.length > 0 && (
              <div className="divide-y divide-line">
                {filed.map((doc) => (
                  <div key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{doc.title}</p>
                      <p className="truncate text-xs text-slate-500">
                        {doc.original_filename ?? "file"} · filed {new Date(doc.uploaded_at).toLocaleDateString()}
                        {doc.expiration_date ? ` · expires ${doc.expiration_date}` : ""}
                      </p>
                    </div>
                    <StatusBadge tone={statusTone(doc.evidence_status)}>
                      {(doc.evidence_status ?? "not submitted").replace(/_/g, " ")}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-line px-5 py-4">
              {editable && (
                <ProcedureEditor
                  kind={kind.key}
                  content={live?.content ?? null}
                  status={live?.status ?? "none"}
                  version={live?.version ?? null}
                  adoptedAt={live?.adopted_at ?? null}
                  adoptedBy={live?.profiles?.full_name ?? live?.profiles?.email ?? null}
                  readOnly={isAdministrator}
                />
              )}

              {/* A kind with no drafter is filed as a document. Both kinds
                  listed today are drafted, but the list may grow. */}
              {!editable && (
                <ImporterRecordUpload
                  documentKind={kind.key}
                  label={kind.title}
                  importerId={importerId}
                  hasDocuments={count > 0}
                />
              )}
            </div>
          </section>
        );
      })}

      {/* Where the three that used to be listed here went, so nobody hunts for
          them — see the note on IMPORTER_RECORD_KINDS. */}
      <section className="rounded-lg border border-line bg-slate-50 px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Kept elsewhere</h2>
        <dl className="mt-2 space-y-2 text-sm text-slate-600">
          <div>
            <dt className="inline font-semibold text-slate-700">Importer identification (21 CFR 1.509): </dt>
            <dd className="inline">
              {data.dunsNumber ? (
                <>D-U-N-S <span className="font-mono text-ink">{data.dunsNumber}</span> is on file and is sent with every inspection package.</>
              ) : (
                <span className="font-semibold text-amber-700">
                  No D-U-N-S number is on file for your organization. It has to be transmitted at entry as your
                  FSVP importer identifier; ask a platform administrator to add it to your account.
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold text-slate-700">Qualified individual qualifications (21 CFR 1.503): </dt>
            <dd className="inline">
              filed per person on the{" "}
              <Link href="/qualified-individuals" className="font-semibold text-forest hover:underline">
                Qualified Individuals
              </Link>{" "}
              register.
            </dd>
          </div>
          <div>
            <dt className="inline font-semibold text-slate-700">Relying on someone else&apos;s hazard analysis (21 CFR 1.504(a)): </dt>
            <dd className="inline">
              recorded on each{" "}
              <Link href="/fsvp-records" className="font-semibold text-forest hover:underline">
                FSVP record
              </Link>
              &apos;s hazard analysis, where the qualified individual signs.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
