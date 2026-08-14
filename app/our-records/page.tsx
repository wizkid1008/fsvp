import Link from "next/link";
import { CheckCircle2, CircleAlert, FileText } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { NextStepBanner } from "@/components/ui/NextStepBanner";
import { ImporterRecordUpload } from "@/components/evidence/ImporterRecordUpload";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { outstandingRequired, summariseImporterRecords } from "@/lib/fsvp/importer-records";
import type { StatusTone } from "@/types/platform";

export const runtime = "edge";

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

  const summary = summariseImporterRecords(documents);
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
            ? "1 required record has no accepted document yet"
            : `${outstanding} required records have no accepted document yet`}
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

              <div className="border-t border-line px-5 py-3">
                <ImporterRecordUpload
                  documentKind={kind.key}
                  label={kind.title}
                  importerId={importerId}
                  hasDocuments={count > 0}
                />
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
