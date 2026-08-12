"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, FileWarning, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

export type ReferenceRuleRow = {
  id: string;
  commodity_name: string;
  origin: string;
  intended_use: string;
  processing_state: string;
  admissibility: "permitted" | "restricted" | "prohibited";
  citation: string;
  source_url: string;
  verification_status: "draft" | "verified";
  verified_at: string | null;
  verified_against: string | null;
  verifier_name: string | null;
  entered_by_name: string | null;
  entered_by_profile_id: string | null;
  review_due_at: string;
  days_until_review: number;
  is_current: boolean;
  is_draft: boolean;
  is_overdue: boolean;
  source_moved: boolean;
};

const btnClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:opacity-60";
const ghostBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-line bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60";
const areaClass =
  "mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest";
const labelClass = "block text-sm font-medium text-slate-700";

const OUTCOME_TONE: Record<ReferenceRuleRow["admissibility"], StatusTone> = {
  permitted:  "success",
  restricted: "warning",
  prohibited: "danger",
};

/** Why a rule cannot currently be relied on — the reason, not just a flag. */
function attentionReason(r: ReferenceRuleRow): { label: string; detail: string; tone: StatusTone } | null {
  if (r.is_draft) {
    return {
      label: "Unverified draft",
      tone: "warning",
      detail:
        "Entered but not confirmed against the source by a second person. It cannot support a " +
        "determination, and any movement it covers is forced to manual review.",
    };
  }
  if (r.source_moved) {
    return {
      label: "Source changed",
      tone: "danger",
      detail:
        "The underlying text has changed since this was verified. Re-read the citation and verify " +
        "again — the answer may have moved.",
    };
  }
  if (r.is_overdue) {
    return {
      label: `Review overdue`,
      tone: "danger",
      detail:
        `Due for re-checking on ${r.review_due_at}. The rule may well still be correct; what has ` +
        `lapsed is our warrant for asserting it.`,
    };
  }
  if (r.days_until_review <= 30) {
    return {
      label: `Review due in ${r.days_until_review}d`,
      tone: "warning",
      detail: `Due on ${r.review_due_at}.`,
    };
  }
  return null;
}

function VerifyForm({
  rule, viewerProfileId, onClose,
}: {
  rule: ReferenceRuleRow; viewerProfileId: string; onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The server refuses this too; saying so here saves writing a note that is
  // about to be rejected.
  const isOwnEntry = rule.entered_by_profile_id === viewerProfileId;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const res = await fetch("/api/reference-rules/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rule_id: rule.id,
            verified_against: fd.get("verified_against")?.toString().trim() ?? "",
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { setError(json.error ?? "Could not record the verification."); return; }
        onClose();
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-auto w-full max-w-lg rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-forest" />
            <h2 className="text-lg font-semibold text-ink">Verify this rule</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 transition hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-6 py-5">
          <div className="rounded-md bg-slate-50 p-3 text-sm">
            <p className="font-medium text-ink">
              {rule.commodity_name} — {rule.origin}
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              {rule.intended_use}, {rule.processing_state} · {rule.admissibility} · {rule.citation}
            </p>
            <a
              href={rule.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block text-xs font-medium text-forest underline underline-offset-2"
            >
              Open the source
            </a>
          </div>

          {isOwnEntry ? (
            <p className="rounded-md bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
              You entered this rule, so you cannot verify it. A transcription error is invisible to
              whoever made it — ask a colleague to check this one.
            </p>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-slate-600">
                Confirm the rule against the agency source, then record what you actually consulted.
                This is what makes it usable for determinations.
              </p>
              <div>
                <label className={labelClass} htmlFor="verified_against">What did you check?</label>
                <textarea
                  id="verified_against"
                  name="verified_against"
                  rows={3}
                  required
                  className={areaClass}
                  placeholder="e.g. ACIR, mango (Mangifera indica) from Mexico, fresh for consumption, retrieved 11 Aug 2026"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Name the database, the entry and the date. A verification nobody can retrace is
                  not worth recording.
                </p>
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={pending || isOwnEntry} className={btnClass}>
              {pending ? "Recording…" : "Confirm and verify"}
            </button>
            <button type="button" onClick={onClose} className={ghostBtn}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ReferenceRulesClient({
  rules, viewerProfileId,
}: {
  rules: ReferenceRuleRow[];
  viewerProfileId: string;
}) {
  const [verifying, setVerifying] = useState<ReferenceRuleRow | null>(null);
  const [tab, setTab] = useState<"attention" | "all">("attention");

  const withReason = useMemo(
    () => rules.map((r) => ({ rule: r, reason: attentionReason(r) })),
    [rules]
  );
  const needsAttention = useMemo(
    () => withReason.filter((x) => x.reason !== null),
    [withReason]
  );

  const shown = tab === "attention" ? needsAttention : withReason;

  return (
    <div className="mt-6 space-y-5">
      {/* The point of the screen, stated once. */}
      <p className="flex gap-2 rounded-lg border border-line bg-white p-4 text-sm leading-relaxed text-slate-600">
        <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <span>
          APHIS publishes no API for commodity import requirements, so every rule here was
          transcribed by hand from an agency page. A rule is not usable because somebody typed it —
          it has to be confirmed against the source by a second person, and re-checked before its
          review date. Rules below that line still appear in searches; they simply stop being
          something the platform will assert.
        </span>
      </p>

      <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-white p-1">
        {([
          { key: "attention" as const, label: `Needs attention (${needsAttention.length})` },
          { key: "all" as const,       label: `All rules (${rules.length})` },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "rounded-md px-3 py-1.5 text-sm font-medium transition " +
              (tab === t.key ? "bg-forest text-white" : "text-slate-600 hover:bg-slate-50")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-line bg-white px-6 py-10 text-center">
          <p className="text-sm text-slate-600">
            {rules.length === 0
              ? "No country-commodity rules have been entered yet. Until there are some, every " +
                "admissibility question correctly answers “no rule on file”."
              : "Nothing needs attention. Every rule is verified and inside its review period."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(({ rule, reason }) => (
            <div key={rule.id} className="rounded-lg border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{rule.commodity_name}</span>
                    <span className="text-sm text-slate-500">from {rule.origin}</span>
                    <StatusBadge tone={OUTCOME_TONE[rule.admissibility]}>
                      {rule.admissibility}
                    </StatusBadge>
                    {reason && <StatusBadge tone={reason.tone}>{reason.label}</StatusBadge>}
                    {!reason && <StatusBadge tone="success">Verified</StatusBadge>}
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {rule.intended_use}, {rule.processing_state} · {rule.citation}
                  </p>
                  {reason && (
                    <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-slate-600">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span>{reason.detail}</span>
                    </p>
                  )}
                  {rule.verified_at && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock className="h-3 w-3" />
                      Verified {rule.verified_at} by {rule.verifier_name ?? "someone"}
                      {rule.verified_against ? ` — ${rule.verified_against}` : ""}
                    </p>
                  )}
                </div>

                <button onClick={() => setVerifying(rule)} className={ghostBtn}>
                  {rule.is_draft ? "Verify" : "Re-verify"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {verifying && (
        <VerifyForm
          rule={verifying}
          viewerProfileId={viewerProfileId}
          onClose={() => setVerifying(null)}
        />
      )}
    </div>
  );
}
