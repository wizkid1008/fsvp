"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SUSPENSION_BASES } from "@/lib/fsvp/gates";

export type SuspensionRow = {
  id: string;
  supplier_id: string;
  basis: string;
  reason: string;
  suspended_at: string;
};

const btnClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:opacity-60";
const dangerBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60";
const ghostBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-line bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60";
const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
const areaClass =
  "mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest";
const labelClass = "block text-sm font-medium text-slate-700";

/**
 * Suspending and reinstating a supplier.
 *
 * Both directions need a reason. A suspension that can be lifted silently is
 * not a control, and "why was this supplier reinstated" is a question an FDA
 * investigator asks — see 010_suspension_assurances_verification.sql.
 */
export function SuspensionControl({
  supplierId, supplierName, suspension,
}: {
  supplierId: string;
  supplierName: string;
  suspension: SuspensionRow | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const res = suspension
          ? await fetch("/api/suppliers/suspension", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                suspension_id: suspension.id,
                lift_rationale: fd.get("lift_rationale")?.toString().trim() ?? "",
              }),
            })
          : await fetch("/api/suppliers/suspension", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                supplier_id: supplierId,
                basis: fd.get("basis")?.toString() ?? "",
                reason: fd.get("reason")?.toString().trim() ?? "",
              }),
            });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "Could not record that.");
          return;
        }
        setOpen(false);
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {suspension && <StatusBadge tone="danger">Suspended</StatusBadge>}
        <button
          onClick={() => { setError(null); setOpen(true); }}
          className={suspension ? ghostBtn : dangerBtn}
        >
          {suspension ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
          {suspension ? "Lift suspension" : "Suspend"}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-auto w-full max-w-lg rounded-lg border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div className="flex items-center gap-2">
                {suspension
                  ? <ShieldCheck className="h-4 w-4 text-forest" />
                  : <ShieldOff className="h-4 w-4 text-red-600" />}
                <h2 className="text-lg font-semibold text-ink">
                  {suspension ? "Lift suspension" : "Suspend supplier"}
                </h2>
              </div>
              <button onClick={() => setOpen(false)} className="rounded p-1 transition hover:bg-slate-100">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4 px-6 py-5">
              <p className="text-sm text-slate-600">
                {suspension ? (
                  <>
                    <span className="font-medium text-ink">{supplierName}</span> was suspended on{" "}
                    {new Date(suspension.suspended_at).toLocaleDateString()}: {suspension.reason}
                  </>
                ) : (
                  <>
                    While <span className="font-medium text-ink">{supplierName}</span> is suspended,
                    no FSVP record for them can be approved, and every open record is flagged for
                    reassessment under § 1.508(b).
                  </>
                )}
              </p>

              {suspension ? (
                <div>
                  <label className={labelClass} htmlFor="lift_rationale">What changed?</label>
                  <textarea id="lift_rationale" name="lift_rationale" rows={3} required className={areaClass}
                    placeholder="What was resolved, and what evidence supports reinstating them." />
                </div>
              ) : (
                <>
                  <div>
                    <label className={labelClass} htmlFor="basis">Basis</label>
                    <select id="basis" name="basis" required className={inputClass}>
                      {SUSPENSION_BASES.map((b) => (
                        <option key={b.basis} value={b.basis}>{b.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="reason">Reason</label>
                    <textarea id="reason" name="reason" rows={3} required className={areaClass}
                      placeholder="What happened, and what the supplier would need to resolve." />
                  </div>
                </>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-2">
                <button type="submit" disabled={pending} className={btnClass}>
                  {pending ? "Saving…" : suspension ? "Lift suspension" : "Suspend supplier"}
                </button>
                <button type="button" onClick={() => setOpen(false)} className={ghostBtn}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
