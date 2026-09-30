"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Clock, Send } from "lucide-react";

/**
 * Hands a prepared record to the importer for their decision
 * (app/api/fsvp-records/[id]/submit). Offered while the record is undecided;
 * once submitted it says so, since the decision itself is the importer's.
 *
 * `blockingReasons` is the same list the approval form shows, from
 * lib/fsvp/approval-readiness.ts — submitting is refused on it too, so the
 * button stays disabled rather than failing after the click.
 */
export function SubmitForApprovalPanel({
  recordId,
  submitted,
  blockingReasons,
}: {
  recordId: string;
  submitted: boolean;
  blockingReasons: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (submitted) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <Clock className="h-4 w-4 shrink-0" />
        <span>Submitted for approval. It is waiting on the importer&apos;s decision.</span>
      </div>
    );
  }

  const blocked = blockingReasons.length > 0;

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/fsvp-records/${recordId}/submit`, { method: "POST" });
        const json = await res.json().catch(() => ({})) as { error?: string; reasons?: string[] };
        if (!res.ok) {
          setError([json.error, ...(json.reasons ?? [])].filter(Boolean).join(" ") || "Could not submit the record.");
          return;
        }
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {blocked ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-900">Finish these before submitting</p>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-8 text-sm text-amber-900">
            {blockingReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Everything approval requires is in place. Submitting puts this record in the importer&apos;s
          queue for their decision.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={submit}
        disabled={pending || blocked}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-forest px-5 text-sm font-semibold text-white hover:bg-[#195f4d] disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        {pending ? "Submitting…" : "Submit for approval"}
      </button>
    </div>
  );
}
