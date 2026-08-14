// POST — machine-triggered compliance maintenance.
//
// This is intentionally separate from /api/regulatory/ingest. The admin route
// remains a human action tied to a profile; this route is a small external-cron
// surface guarded by INGEST_TRIGGER_SECRET and disabled entirely when that
// secret is absent.

import { NextRequest, NextResponse } from "next/server";
import { verifyIngestTriggerSecret } from "@/lib/auth/trigger-secret";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { configuredSources, runSourceIngest } from "@/lib/regulatory/ingest";
import { deliverPendingAlerts } from "@/lib/notifications/deliver-alerts";
import { sweepRuleReviews } from "@/lib/regulatory/sweep-rule-reviews";
import { sweepEcfrChanges } from "@/lib/regulatory/sweep-ecfr";
import type { RegulatorySourceId } from "@/lib/regulatory/sources";

export const runtime = "edge";

type Body = {
  source?: string;
  alerts?: boolean;
};

// generate_compliance_alerts_all() sums every sweep — the original three
// branches from migration 003 plus the FDA registration renewal added in 017.
// Falls back to the original when 017 has not been applied, so deploying the
// code before running the migration degrades to the previous behaviour instead
// of failing the whole cron.
async function generateAlerts(admin: ReturnType<typeof createAdminSupabaseClient>) {
  const all = await (admin as any).rpc("generate_compliance_alerts_all");
  if (!all.error) return typeof all.data === "number" ? all.data : Number(all.data ?? 0);

  const { data, error } = await (admin as any).rpc("generate_compliance_alerts");
  if (error) throw new Error(`Generating compliance alerts failed: ${error.message}`);
  return typeof data === "number" ? data : Number(data ?? 0);
}

export async function POST(req: NextRequest) {
  const verified = await verifyIngestTriggerSecret(req.headers);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.message }, { status: verified.status });
  }

  const body = await req.json().catch(() => ({})) as Body;
  const admin = createAdminSupabaseClient();
  const available = configuredSources();
  const requestedSource = body.source as RegulatorySourceId | undefined;

  const source = requestedSource && available.includes(requestedSource)
    ? requestedSource
    : null;

  const alertsCreated = body.alerts === false ? 0 : await generateAlerts(admin);

  // Generating an alert is not the same as anyone hearing about it. Until now
  // this route stopped at the line above, and compliance_alerts was read by
  // nothing — the sweep found expiring certificates and overdue reassessments
  // and put them somewhere no screen looked. Delivery runs even when alert
  // generation was skipped, so a backlog left by an earlier failure still goes
  // out. See lib/notifications/deliver-alerts.ts.
  //
  // Caught rather than thrown. This route is also how the four FDA sources are
  // ingested — the scheduled workflow calls it five times a day — and delivery
  // now runs before that branch. Letting a notification failure propagate would
  // turn "the bell is quiet" into "regulatory ingest stopped", which is a much
  // worse outage and a far less obvious one. The error is reported in the
  // response so the workflow log still shows it.
  let delivered = 0;
  let deliveryError: string | null = null;
  try {
    delivered = (await deliverPendingAlerts(admin)).delivered;
  } catch (err) {
    deliveryError = err instanceof Error ? err.message : String(err);
  }

  // eCFR runs BEFORE the review sweep, so a section amended overnight is
  // flagged and then raised in the same pass rather than waiting a day. It only
  // sets source_changed_at; the review sweep decides who hears about it.
  let ecfrFlagged = 0;
  let ecfrError: string | null = null;
  if (body.alerts !== false) {
    try {
      ecfrFlagged = (await sweepEcfrChanges(admin)).flagged;
    } catch (err) {
      ecfrError = err instanceof Error ? err.message : String(err);
    }
  }

  // Rule reviews are platform work, not tenant work, so they do not pass
  // through compliance_alerts at all — that table requires an importer_id and a
  // country-commodity rule belongs to nobody's tenant. Caught for the same
  // reason as delivery above: this route also drives FDA ingest, and a quiet
  // notification must not stop it.
  let rulesRaised = 0;
  let ruleReviewError: string | null = null;
  if (body.alerts !== false) {
    try {
      rulesRaised = (await sweepRuleReviews(admin)).raised;
    } catch (err) {
      ruleReviewError = err instanceof Error ? err.message : String(err);
    }
  }

  if (requestedSource && !source) {
    return NextResponse.json({
      ok: true,
      alerts_created: alertsCreated,
      alerts_delivered: delivered,
      alerts_delivery_error: deliveryError,
      rule_reviews_raised: rulesRaised,
      rule_review_error: ruleReviewError,
      ecfr_flagged: ecfrFlagged,
      ecfr_error: ecfrError,
      available_sources: available,
      ingest: {
        source: requestedSource,
        skipped: true,
        reason: `${requestedSource} is not configured for this deployment.`,
      },
    });
  }

  const ingest = source
    ? await runSourceIngest(admin, source, { triggeredByProfileId: null })
    : null;

  const ok = !ingest?.error;
  return NextResponse.json(
    {
      ok,
      alerts_created: alertsCreated,
      alerts_delivered: delivered,
      alerts_delivery_error: deliveryError,
      rule_reviews_raised: rulesRaised,
      rule_review_error: ruleReviewError,
      ecfr_flagged: ecfrFlagged,
      ecfr_error: ecfrError,
      available_sources: available,
      ingest: ingest
        ? {
            source,
            run_id: ingest.runId,
            records_seen: ingest.recordsSeen,
            records_new: ingest.recordsNew,
            candidates_created: ingest.candidatesCreated,
            window_from: ingest.windowFrom,
            window_to: ingest.windowTo,
            caught_up: ingest.caughtUp,
            error: ingest.error ?? null,
          }
        : null,
    },
    { status: ok ? 200 : 502 }
  );
}
