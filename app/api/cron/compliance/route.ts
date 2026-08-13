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
import type { RegulatorySourceId } from "@/lib/regulatory/sources";

export const runtime = "edge";

type Body = {
  source?: string;
  alerts?: boolean;
};

async function generateAlerts(admin: ReturnType<typeof createAdminSupabaseClient>) {
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
  const delivery = await deliverPendingAlerts(admin);

  if (requestedSource && !source) {
    return NextResponse.json({
      ok: true,
      alerts_created: alertsCreated,
      alerts_delivered: delivery.delivered,
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
      alerts_delivered: delivery.delivered,
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
