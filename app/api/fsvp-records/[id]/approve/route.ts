// POST { decision, decision_notes?, conditions_text? }
// Importer makes final approval decision on an FSVP record.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isValidDecision, isValidReassessmentMonths, statusForDecision, type ApprovalDecision } from "@/lib/fsvp/status-transitions";
import { evaluateAttestations } from "@/lib/fsvp/qi-attestation";
import { fetchDetermination, isDeterminationLive } from "@/lib/fsvp/applicability";
import { evaluateGates } from "@/lib/fsvp/gates";
import { scoreFsvpRecord } from "@/lib/scoring";
import { notify } from "@/lib/notifications/notify";

export const runtime = "edge";

type Decision = ApprovalDecision;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role, importer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["us_importer", "administrator"].includes(profile.role)) {
    return NextResponse.json({ error: "Only importers can make approval decisions." }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const { id } = params;

  const { data: record } = await (admin.from("fsvp_records") as any)
    .select(
      "importer_id, rule_version_id, status, supplier_id, facility_id, product_id, " +
      "hazard_analysis_notes, supplier_evaluation_notes, verification_determination"
    )
    .eq("id", id)
    .maybeSingle();

  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  if (record.importer_id !== profile.importer_id && profile.role !== "administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { decision, decision_notes, conditions_text, reassessment_months } = body as {
    decision: Decision;
    decision_notes?: string;
    conditions_text?: string;
    reassessment_months?: number;
  };

  if (!isValidDecision(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  if (!isValidReassessmentMonths(reassessment_months)) {
    return NextResponse.json({ error: "reassessment_months must be between 1 and 120." }, { status: 400 });
  }

  // Block approval when critical compliance gaps are still open.
  //
  // This used to read the most recent scoring_results row, which made the gate
  // trivially bypassable: nothing scores an fsvp_record automatically (the only
  // recalc trigger fires for facility/product, and requires a rule_version_id
  // documents rarely carry), so on an unscored record the query returned null
  // and approval sailed through. A record with no evidence, no narratives and
  // no hazard analysis could reach importer_approved and then lock.
  //
  // Score synchronously instead, and fail closed if scoring cannot run. An
  // approval is the importer's regulatory attestation — it must not be granted
  // on the basis of a missing measurement.
  let freshScore: number | null = null;
  if (decision === "approved" || decision === "conditionally_approved") {
    // § 1.503 gate, checked before scoring: it is the cheaper query and its
    // failure message tells the importer exactly what to go and do, whereas a
    // scoring failure does not. A qualified individual must have performed or
    // overseen the hazard analysis, the supplier evaluation and the
    // verification activities determination, and their signature must still
    // match the text it was made against.
    const { data: attestationRows, error: attestationError } = await (admin.from("qi_attestations") as any)
      .select("attestation_type, content_hash, revoked_at")
      .eq("fsvp_record_id", id);

    if (attestationError) {
      return NextResponse.json(
        {
          error:
            "Cannot approve: the qualified individual attestations could not be read, so § 1.503 coverage cannot be confirmed. " +
            attestationError.message,
        },
        { status: 503 }
      );
    }

    // How FSVP applies to this food decides what has to be signed. A very small
    // importer is not required to conduct a hazard analysis or supplier
    // evaluation (§ 1.512), so demanding signatures on either would be asking a
    // qualified individual to attest to work the regulation never called for.
    const determination = await fetchDetermination(
      admin, record.importer_id, record.supplier_id, record.product_id
    );

    if (!determination) {
      return NextResponse.json(
        {
          error:
            "Cannot approve: nobody has determined whether FSVP applies to this food. " +
            "A qualified individual must make an applicability determination first.",
        },
        { status: 400 }
      );
    }

    if (!isDeterminationLive(determination)) {
      return NextResponse.json(
        {
          error:
            `Cannot approve: the applicability determination for this food expired on ${determination.expires_at}. ` +
            "A qualified individual must make a current one.",
        },
        { status: 400 }
      );
    }

    const attestations = await evaluateAttestations(record, attestationRows ?? [], determination.outcome);
    if (!attestations.satisfied) {
      return NextResponse.json(
        {
          error: "Cannot approve: this record is not covered by a current qualified individual attestation.",
          reasons: attestations.reasons,
        },
        { status: 400 }
      );
    }

    // Suspension, the § 1.506(d) determination and § 1.507 assurances. Each of
    // these existed in the schema before migration 010 as a value nothing read,
    // so a suspended supplier's record could be approved and a lapsed assurance
    // went unnoticed. All blockers are returned together rather than one at a
    // time — see lib/fsvp/gates.ts.
    const gateBlocks = await evaluateGates(admin, {
      importerId:   record.importer_id,
      supplierId:   record.supplier_id,
      fsvpRecordId: id,
      outcome:      determination.outcome,
    });

    if (gateBlocks.length > 0) {
      return NextResponse.json(
        {
          error: "Cannot approve: this record has unresolved blocking conditions.",
          reasons: gateBlocks.map((b) => b.message),
          codes:   gateBlocks.map((b) => b.code),
        },
        { status: 400 }
      );
    }

    let scoreResult;
    try {
      scoreResult = await scoreFsvpRecord(
        id,
        record.facility_id,
        record.product_id,
        record.rule_version_id
      );
    } catch (err) {
      return NextResponse.json(
        {
          error:
            "Cannot approve: the compliance score could not be calculated, so unresolved critical gaps cannot be ruled out. " +
            (err instanceof Error ? err.message : "Scoring failed."),
        },
        { status: 503 }
      );
    }

    if (scoreResult.critical_blockers_present) {
      return NextResponse.json(
        { error: "Cannot approve: unresolved critical compliance gaps remain. All critical items must be satisfied before approval." },
        { status: 400 }
      );
    }

    freshScore = scoreResult.overall_score;
  }

  const now = new Date();
  const months = reassessment_months ?? 12;
  const reassessmentDue = new Date(now);
  reassessmentDue.setMonth(reassessmentDue.getMonth() + months);

  const newStatus = statusForDecision(decision);

  await (admin.from("fsvp_records") as any)
    .update({
      approval_decision: decision === "revision_requested" ? null : decision,
      approved_by_profile_id: user.id,
      approved_at: decision !== "revision_requested" ? now.toISOString() : null,
      reassessment_due_at: reassessmentDue.toISOString(),
      status: newStatus,
      // Persist the score the decision was actually made against, so the record
      // shows what the importer saw rather than whatever was last cached.
      ...(freshScore !== null ? { overall_score: freshScore } : {}),
    })
    .eq("id", id);

  // Record in approval_decisions history
  await (admin.from("approval_decisions") as any).insert({
    fsvp_record_id: id,
    importer_id: record.importer_id,
    decision,
    decision_notes: decision_notes ?? null,
    conditions_text: conditions_text ?? null,
    decided_by_profile_id: user.id,
    rule_version_id: record.rule_version_id,
  });

  // Create/update reassessment schedule for approved/conditional
  if (decision === "approved" || decision === "conditionally_approved") {
    const { data: existingSchedule } = await (admin.from("reassessment_schedules") as any)
      .select("id")
      .eq("fsvp_record_id", id)
      .maybeSingle();

    if (existingSchedule) {
      await (admin.from("reassessment_schedules") as any)
        .update({
          frequency_months: months,
          last_assessed_at: now.toISOString(),
          next_due_at: reassessmentDue.toISOString(),
          status: "scheduled",
        })
        .eq("id", existingSchedule.id);
    } else {
      await (admin.from("reassessment_schedules") as any).insert({
        fsvp_record_id: id,
        importer_id: record.importer_id,
        frequency_months: months,
        last_assessed_at: now.toISOString(),
        next_due_at: reassessmentDue.toISOString(),
        status: "scheduled",
      });
    }
  }

  await (admin.from("audit_logs") as any).insert({
    importer_id: record.importer_id,
    actor_profile_id: user.id,
    actor_role: profile.role,
    action: `fsvp_record_${decision}`,
    record_type: "fsvp_records",
    record_id: id,
    new_value: { decision, decision_notes, conditions_text },
  });

  const decisionCopy: Record<Decision, { title: string; body: string; severity: "info" | "warning" | "critical" }> = {
    approved: {
      title:    "FSVP record approved",
      body:     "The importer approved this supplier/product combination. Keep your evidence current — the record is reassessed on schedule.",
      severity: "info",
    },
    conditionally_approved: {
      title:    "FSVP record conditionally approved",
      body:     conditions_text
        ? `Conditions: ${conditions_text}`
        : "Approved subject to conditions. Review the record for what remains outstanding.",
      severity: "warning",
    },
    rejected: {
      title:    "FSVP record rejected",
      body:     decision_notes ? `Reason: ${decision_notes}` : "The importer rejected this supplier/product combination.",
      severity: "critical",
    },
    revision_requested: {
      title:    "FSVP record sent back for revision",
      body:     decision_notes ? `Requested: ${decision_notes}` : "The importer has asked for changes before deciding.",
      severity: "warning",
    },
  };

  const c = decisionCopy[decision];
  if (c) {
    await notify(admin, {
      importerId: record.importer_id,
      supplierId: record.supplier_id,
      type:       `fsvp_record_${decision}`,
      title:      c.title,
      body:       c.body,
      targetUrl:  `/fsvp-records/${id}`,
      severity:   c.severity,
    });
  }

  return NextResponse.json({ success: true, status: newStatus });
}
