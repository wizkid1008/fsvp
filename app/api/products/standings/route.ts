import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveRequestImporter } from "@/lib/auth/request-importer";
import { loadCompleteFsvpSetupPlan } from "@/lib/setup/fsvp-workflow";
import { isBlockedStanding, phaseFor, summariseProducts } from "@/lib/dashboard/product-journey";
import type { ProductStandingsResponse } from "@/components/products/ProductStandings";
import type { ReasonItem } from "@/components/products/ProductReasons";
import type { ProductReason } from "@/lib/setup/fsvp-workflow";

const toReasonItem = ({ id, message, href, actionLabel, stepNumber }: ProductReason): ReasonItem =>
  ({ id, message, href, actionLabel, stepNumber });

export const runtime = "edge";

/**
 * Where each of this importer's products stands, as the dashboard's Product
 * Status card counts it (lib/dashboard/product-journey.ts). The Products page
 * reads this so its "Approved" means the same thing — a product through every
 * gate with an approved FSVP record — rather than a document score.
 *
 * Its own request, because the setup plan makes several queries per product
 * and per record, and a Worker's subrequest budget is per request.
 */
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const resolved = await resolveRequestImporter(supabase, user);
  if (!resolved.ok) return resolved.response;

  try {
    const plan = await loadCompleteFsvpSetupPlan(resolved.client as any, resolved.importerId);
    const summary = summariseProducts(plan.productStandings);
    const standings: ProductStandingsResponse["standings"] = {};
    for (const standing of plan.productStandings) {
      const blocked = isBlockedStanding(standing);
      const phase = phaseFor(standing);
      // Prohibited outranks every phase: whatever else is done, the food may
      // not be entered. This was Entry Readiness's "Do Not Ship".
      const doNotShip = standing.doNotShip === true;
      standings[standing.id] = {
        phase: doNotShip ? "do_not_ship" : blocked ? "blocked" : phase.key,
        label: doNotShip ? "Do not ship" : blocked ? "Blocked" : phase.label,
        blocked,
        reasons: (plan.productReasons[standing.id] ?? []).map(toReasonItem),
        recordId: standing.recordId,
        recordStatus: standing.recordStatus,
        reassessmentDueAt: standing.reassessmentDueAt ?? null,
      };
    }
    const body: ProductStandingsResponse = {
      standings,
      approved: summary.approved,
      blocked: summary.blocked,
      doNotShip: plan.productStandings.filter((s) => s.doNotShip).length,
      stages: plan.steps.map((step) => ({
        id: step.id,
        title: step.title,
        description: step.description,
        href: step.href,
        actionLabel: step.actionLabel,
        open: step.blockers.length,
      })),
    };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
