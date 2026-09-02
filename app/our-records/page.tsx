import Link from "next/link";
import { CheckCircle2, CircleAlert, FileText } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { NextStepBanner } from "@/components/ui/NextStepBanner";
import { ImporterRecordUpload } from "@/components/evidence/ImporterRecordUpload";
import { ProcedureEditor } from "@/components/evidence/ProcedureEditor";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { outstandingRequired, summariseImporterRecords } from "@/lib/fsvp/importer-records";
import { PROCEDURE_KINDS } from "@/lib/fsvp/procedure-draft";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

/** Obligations the importer writes about its own process, so they are drafted
 *  and edited in place rather than uploaded. Taken from the drafters rather
 *  than restated, so this page cannot offer an editor for something the API
 *  has no way to draft. */
const EDITABLE_PROCEDURES = PROCEDURE_KINDS;

/** What to say before a kind has been drafted, where the default — "builds a
 *  first version from what this platform already enforces" — would overstate
 *  how much of it the platform can actually write. */
const START_HINTS: Record<string, string> = {
  importer_identification:
    "Builds a statement of the identifier you transmit, from the D-U-N-S on file. Who files your entries and how you confirm the number is still active are left for you to answer.",
  hazard_analysis_reliance:
    "Only draft this if you rely on a hazard analysis someone else conducted. It builds the structure § 1.504(a) expects — the substance is yours to write, and adopting it states that you rely on such an analysis.",
};

/**
 * Two of the drafted kinds still take a file as well, because the written
 * record and the evidence behind it are different things: a statement of the
 * D-U-N-S you transmit is not the Dun & Bradstreet record showing it is
 * active, and a review of someone else's hazard analysis is not that analysis.
 */
const SUPPORTING_EVIDENCE: Record<string, string> = {
  importer_identification:
    "File the evidence behind the statement — the Dun & Bradstreet record showing the number is active, or the entry filing that carries it.",
  hazard_analysis_reliance:
    "File the hazard analysis you were given. Your review above assesses it; this is the document being assessed.",
};

/**
 * The importer's own FSVP documents.
 *
 * Every other evidence screen is about a foreign supplier. These establish that
 * an FSVP exists at all — the § 1.506(b) written procedures, the § 1.503
 * qualifications behind each signature, the § 1.510 records procedures — and
 * they are what an investigator asks for before opening any single record.
 * Until migration 020 there was nowhere in the platform to hold them.
 */
export default async function OurRecordsPage() {
  const { role, realRole, user } = await requireProfileRole("/our-records", [
    "us_importer",
    "administrator",
  ]);
  const supabase = createServerSupabaseClient();

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("importer_id, organization_name")
    .eq("id", user.id)
    .maybeSingle();

  const importerId: string | null = profile?.importer_id ?? null;

  if (!importerId) {
    return (
      <AppShell role={role} realRole={realRole}>
        <SectionHeader
          title="Our FSVP Records"
          description="The documents FSVP requires your organization to hold about itself."
        />
        <div className="mt-6 rounded-lg border border-line bg-white px-6 py-10 text-center">
          <p className="text-sm text-slate-600">
            Your account is not linked to an importing organization yet, so it has no records of its own.
          </p>
        </div>
      </AppShell>
    );
  }

  const { data: rawDocs } = await (supabase.from("documents") as any)
    .select("id, title, document_kind, original_filename, uploaded_at, evidence_status, expiration_date")
    .eq("linked_entity_type", "importer")
    .eq("linked_entity_id", importerId)
    .is("soft_deleted_at", null)
    .order("uploaded_at", { ascending: false });

  const documents = (rawDocs ?? []) as Array<{
    id: string;
    title: string;
    document_kind: string | null;
    original_filename: string | null;
    uploaded_at: string;
    evidence_status: string | null;
    expiration_date: string | null;
  }>;

  // Two of the four obligations are procedures the importer writes about its own
  // process, so they live as editable versioned records rather than uploaded
  // files — see migration 021. The other two are genuinely external evidence
  // and stay as documents.
  const { data: rawProcedures } = await (supabase.from("importer_procedures") as any)
    .select("kind, content, status, version, adopted_at, profiles:adopted_by_profile_id(full_name, email)")
    .eq("importer_id", importerId)
    .in("status", ["draft", "adopted"]);

  const procedures = (rawProcedures ?? []) as Array<{
    kind: string;
    content: string;
    status: "draft" | "adopted";
    version: number;
    adopted_at: string | null;
    profiles: { full_name: string | null; email: string } | null;
  }>;

  // An adopted procedure satisfies its obligation the way an accepted document
  // does, so the summary counts both rather than reporting a gap that is filled.
  const adoptedKinds = procedures.filter((p) => p.status === "adopted").map((p) => p.kind);

  const summary = summariseImporterRecords(documents).map((s) =>
    adoptedKinds.includes(s.kind.key) ? { ...s, satisfied: true } : s
  );
  const outstanding = outstandingRequired(summary);

  const statusTone = (s: string | null): StatusTone =>
    s === "accepted" ? "success"
    : s === "rejected" || s === "needs_revision" ? "danger"
    : s === "submitted" || s === "under_review" ? "warning"
    : "neutral";

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Our FSVP Records"
        description="The documents FSVP requires your organization to hold about itself, as distinct from evidence about a foreign supplier. An FDA investigator asks for these first — they establish that an FSVP exists before any individual record is examined."
      />

      {outstanding > 0 && (
        <NextStepBanner>
          {outstanding === 1
            ? "1 required record is not yet in place"
            : `${outstanding} required records are not yet in place`}
          . These are held once by your organization and relied on across every FSVP record you own,
          so a gap here affects all of them at once.
        </NextStepBanner>
      )}

      <div className="mt-6 space-y-4">
        {summary.map(({ kind, documents: count, satisfied }) => {
          const filed = documents.filter((d) => d.document_kind === kind.key);
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
                {(() => {
                  const editable = EDITABLE_PROCEDURES.includes(kind.key);
                  const supporting = SUPPORTING_EVIDENCE[kind.key] ?? null;

                  // A kind can hold both a draft and an adopted version at
                  // once — editing an adopted procedure opens a draft while
                  // the adopted text stays in force. The draft is what you
                  // work on, so it wins here.
                  const forKind = procedures.filter((p) => p.kind === kind.key);
                  const live =
                    forKind.find((p) => p.status === "draft") ??
                    forKind.find((p) => p.status === "adopted") ??
                    null;

                  return (
                    <>
                      {editable && (
                        <ProcedureEditor
                          kind={kind.key}
                          content={live?.content ?? null}
                          status={live?.status ?? "none"}
                          version={live?.version ?? null}
                          adoptedAt={live?.adopted_at ?? null}
                          adoptedBy={live?.profiles?.full_name ?? live?.profiles?.email ?? null}
                          startHint={START_HINTS[kind.key]}
                        />
                      )}

                      {(!editable || supporting) && (
                        <div className={editable ? "mt-5 border-t border-line pt-4" : ""}>
                          {supporting && (
                            <p className="mb-2 text-xs leading-5 text-slate-500">{supporting}</p>
                          )}
                          <ImporterRecordUpload
                            documentKind={kind.key}
                            label={kind.title}
                            importerId={importerId}
                            hasDocuments={count > 0}
                          />
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-xs leading-6 text-slate-500">
        Per-record work lives elsewhere: the hazard analysis, foreign supplier evaluation and
        verification activities determination are written into each{" "}
        <Link href="/fsvp-records" className="font-semibold text-forest hover:underline">FSVP record</Link>{" "}
        and signed there by a qualified individual.
      </p>
    </AppShell>
  );
}
