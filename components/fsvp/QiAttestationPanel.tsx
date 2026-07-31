"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, CircleDashed, PenLine } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  ATTESTATION_LABEL,
  DEFAULT_ATTESTATION_STATEMENT,
  REQUIRED_ATTESTATION_TYPES,
  type RequiredAttestationType,
} from "@/lib/fsvp/qi-attestation";
import type { StatusTone } from "@/types/platform";

export type SignedAttestation = {
  id: string;
  attestation_type: string;
  statement: string;
  signed_at: string;
  signer_name: string;
  qualification_basis: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  /** True when the narrative still matches what was signed. */
  current: boolean;
};

type SectionState = "signed" | "missing" | "stale";

const STATE_TONE: Record<SectionState, StatusTone> = {
  signed: "success",
  stale: "warning",
  missing: "neutral",
};

const STATE_LABEL: Record<SectionState, string> = {
  signed: "Signed",
  stale: "Needs re-signing",
  missing: "Not signed",
};

function RevokeButton({ attestationId }: { attestationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/fsvp/attestations/${attestationId}/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Could not withdraw it.");
        router.refresh();
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-slate-500 underline-offset-2 transition hover:text-red-600 hover:underline"
      >
        Withdraw
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-line bg-slate-50 p-3">
      <label className="block text-xs font-medium text-slate-700" htmlFor={`reason-${attestationId}`}>
        Why are you withdrawing this signature?
      </label>
      <input
        id={`reason-${attestationId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-1.5 h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !reason.trim()}
          className="inline-flex h-8 items-center rounded-md bg-red-600 px-3 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? "Withdrawing…" : "Withdraw"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function QiAttestationPanel({
  recordId,
  state,
  attestations,
  viewerIsActiveQi,
  viewerCanManageRegister,
}: {
  recordId: string;
  state: Record<RequiredAttestationType, SectionState>;
  attestations: SignedAttestation[];
  /** The viewer is on the register and active today, so they may sign. */
  viewerIsActiveQi: boolean;
  /** The viewer can reach the register to add a QI (importers only). */
  viewerCanManageRegister: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<RequiredAttestationType[]>([]);
  const [statement, setStatement] = useState(DEFAULT_ATTESTATION_STATEMENT);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const signable = REQUIRED_ATTESTATION_TYPES.filter((t) => state[t] !== "signed");

  function toggle(type: RequiredAttestationType) {
    setSelected((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function sign() {
    if (selected.length === 0) {
      setError("Choose at least one determination to sign.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/fsvp/attestations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fsvp_record_id: recordId, types: selected, statement }),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Could not sign.");
        setSelected([]);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {REQUIRED_ATTESTATION_TYPES.map((type) => {
        const s = state[type];
        const history = attestations
          .filter((a) => a.attestation_type === type)
          .sort((a, b) => b.signed_at.localeCompare(a.signed_at));

        return (
          <div key={type} className="rounded-md border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                {s === "signed" ? (
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : s === "stale" ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                ) : (
                  <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                )}
                <p className="text-sm font-semibold text-ink">{ATTESTATION_LABEL[type]}</p>
              </div>
              <StatusBadge tone={STATE_TONE[s]}>{STATE_LABEL[s]}</StatusBadge>
            </div>

            {s === "stale" && (
              <p className="mt-2 text-xs text-amber-800">
                This determination was edited after it was signed. The earlier signature covers text
                that is no longer here, so a qualified individual has to sign the current wording
                before the record can be approved.
              </p>
            )}

            {history.length > 0 && (
              <ul className="mt-3 space-y-2 border-t border-line pt-3">
                {history.map((a) => (
                  <li key={a.id} className="text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={a.revoked_at ? "text-slate-400 line-through" : "font-semibold text-slate-700"}>
                        {a.signer_name}
                      </span>
                      <span className="text-slate-500">
                        {new Date(a.signed_at).toLocaleDateString()}{" "}
                        {new Date(a.signed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {a.revoked_at ? (
                        <StatusBadge tone="danger">Withdrawn</StatusBadge>
                      ) : a.current ? (
                        <StatusBadge tone="success">Current</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Superseded text</StatusBadge>
                      )}
                    </div>
                    {a.revoked_reason && (
                      <p className="mt-0.5 text-slate-500">Reason: {a.revoked_reason}</p>
                    )}
                    {!a.revoked_at && a.current && <RevokeButton attestationId={a.id} />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {viewerIsActiveQi ? (
        signable.length === 0 ? (
          <p className="text-sm text-emerald-700">
            Every § 1.503 determination on this record carries your organization&apos;s current
            signature.
          </p>
        ) : (
          <div className="rounded-md border border-forest/30 bg-forest/5 p-4">
            <div className="flex items-center gap-2">
              <PenLine className="h-4 w-4 text-forest" />
              <p className="text-sm font-semibold text-ink">Sign as qualified individual</p>
            </div>

            <div className="mt-3 space-y-2">
              {signable.map((type) => (
                <label key={type} className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selected.includes(type)}
                    onChange={() => toggle(type)}
                    className="mt-1 h-4 w-4 rounded border-line text-forest focus:ring-forest"
                  />
                  <span>{ATTESTATION_LABEL[type]}</span>
                </label>
              ))}
            </div>

            <label className="mt-3 block text-xs font-medium text-slate-700" htmlFor="attestation-statement">
              Statement
            </label>
            <textarea
              id="attestation-statement"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest"
            />
            <p className="mt-1 text-xs text-slate-500">
              Signing records the wording above, your name, the date, and a hash of the text you are
              attesting to. Editing that text afterwards will invalidate this signature.
            </p>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={sign}
              disabled={pending}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:opacity-60"
            >
              <PenLine className="h-4 w-4" />
              {pending ? "Signing…" : `Sign ${selected.length || ""} determination${selected.length === 1 ? "" : "s"}`.trim()}
            </button>
          </div>
        )
      ) : (
        <div className="rounded-md border border-line bg-slate-50 p-4 text-sm text-slate-600">
          {viewerCanManageRegister ? (
            <>
              You are not on this organization&apos;s qualified individual register, so you cannot
              sign these determinations.{" "}
              <Link href="/qualified-individuals" className="font-semibold text-forest hover:underline">
                Register yourself or invite a qualified individual
              </Link>
              .
            </>
          ) : (
            <>Only a registered qualified individual can sign these determinations.</>
          )}
        </div>
      )}
    </div>
  );
}
