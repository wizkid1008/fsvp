import Link from "next/link";
import {
  basisSpec,
  isDeterminationLive,
  OUTCOME_LABEL,
  type LiveDetermination,
} from "@/lib/fsvp/applicability";

/**
 * How FSVP applies to one food, and the single place to go and settle it.
 *
 * This lived at the bottom of the FSVP record page, below the hazard analysis,
 * verification activities and evidence package — three sections whose required
 * contents this determination decides (see requiredTypesFor in
 * lib/fsvp/qi-attestation.ts). Reading the answer after the work it governs is
 * the wrong way round, and on an 840-line page it was below the fold anyway.
 *
 * It belongs on the product, before a record exists: the determination is keyed
 * on importer + supplier + product, and the product page is where an importer
 * decides what this food needs. The record page still refuses to approve
 * without a live determination (app/api/fsvp-records/[id]/approve/route.ts), so
 * nothing is enforced any less by showing it earlier — it is shown sooner.
 *
 * Presentational and server-safe: the caller does the fetching, so the same
 * card can be dropped anywhere a determination is already in hand.
 */
export function ApplicabilityCard({
  determination,
}: {
  determination: LiveDetermination | null;
}) {
  const live = determination ? isDeterminationLive(determination) : false;
  const spec = determination ? basisSpec(determination.basis) : null;

  const block = !determination
    ? "Nobody has determined whether FSVP applies to this food. A qualified individual must do that before the record can be approved."
    : !live
      ? `The applicability determination for this food expired on ${determination.expires_at}. A qualified individual must make a current one.`
      : null;

  return (
    <section
      className={`rounded-lg border p-5 shadow-soft ${
        block ? "border-amber-200 bg-amber-50" : "border-line bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">How FSVP Applies</h2>
          {block ? (
            <p className="mt-1 max-w-2xl text-sm text-amber-900">{block}</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-700">
                <span className="font-semibold">{OUTCOME_LABEL[determination!.outcome]}</span>
                {spec && <> — {spec.label}</>}
                <span className="text-slate-500"> · {determination!.citation}</span>
              </p>
              {determination!.outcome === "modified" && (
                <p className="mt-1 max-w-2xl text-sm text-slate-600">
                  Under {determination!.citation} this record does not require a hazard analysis
                  or a foreign supplier evaluation. The verification activities determination is
                  still required, because the written assurance that replaces them is itself a
                  verification activity.
                </p>
              )}
              {determination!.expires_at && (
                <p className="mt-1 text-xs text-slate-500">
                  Expires {new Date(determination!.expires_at).toLocaleDateString()}
                </p>
              )}
            </>
          )}
        </div>
        <Link
          href="/applicability"
          className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
        >
          {determination ? "Review determination" : "Determine applicability"}
        </Link>
      </div>
    </section>
  );
}
