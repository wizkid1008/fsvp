"use client";

/**
 * The FDA product code for this product as packed.
 *
 * Separate from the admissibility panel on purpose. Admissibility asks whether
 * the movement may enter; this is what goes on the entry line once it does.
 * Sharing a card would suggest one answers the other.
 *
 * Nothing here derives a code. The importer's broker or ACE entry is the
 * source, and FDA's Product Code Builder is asked whether what they have is
 * real — the only direction that carries a warrant, because subclass encodes
 * the container and PIC encodes the process and the taxonomy knows neither.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, HelpCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

export type ProductFdaCode = {
  code: string | null;
  subclass: string | null;
  pic: string | null;
  verified_at: string | null;
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
const labelClass = "block text-sm font-medium text-slate-700";
const buttonClass =
  "inline-flex h-10 items-center justify-center rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60";

export function ProductFdaCodeCard({
  productId,
  current,
  canManage,
}: {
  productId: string;
  current: ProductFdaCode;
  canManage: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState(current.code ?? "");
  const [subclass, setSubclass] = useState("");
  const [pic, setPic] = useState("");
  /** Set when FDA's format cannot say whether the middle character is subclass or PIC. */
  const [ambiguous, setAmbiguous] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setReasons([]);
    setNote(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/products/fda-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            fda_product_code: code,
            subclass: subclass || undefined,
            pic: pic || undefined,
          }),
        });
        const json = await res.json().catch(() => ({})) as {
          error?: string;
          reasons?: string[];
          note?: string;
        };

        if (!res.ok) {
          setError(json.error ?? "Could not record the code.");
          setReasons(Array.isArray(json.reasons) ? json.reasons : []);
          // 409 on a code of this length means the middle element is unresolved.
          if (res.status === 409 && code.trim().length === 6) setAmbiguous(true);
          return;
        }
        setAmbiguous(false);
        setNote(json.note ?? "Recorded.");
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">FDA product code</p>
          <h2 className="mt-1 text-base font-semibold text-ink">What goes on the entry line</h2>
        </div>
        {current.code ? (
          current.verified_at ? (
            <StatusBadge tone="success">
              <BadgeCheck className="mr-1 h-3.5 w-3.5" /> Verified {current.verified_at.slice(0, 10)}
            </StatusBadge>
          ) : (
            <StatusBadge tone="warning">
              <HelpCircle className="mr-1 h-3.5 w-3.5" /> Not checked with FDA
            </StatusBadge>
          )
        ) : (
          <StatusBadge tone="neutral">Not recorded</StatusBadge>
        )}
      </div>

      {current.code && (
        <dl className="mt-4 grid gap-3 rounded-md bg-slate-50 p-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Code</dt>
            <dd className="mt-1 font-mono font-medium text-ink">{current.code}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Subclass (container)</dt>
            <dd className="mt-1 font-medium text-ink">{current.subclass ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">PIC (process)</dt>
            <dd className="mt-1 font-medium text-ink">{current.pic ?? "—"}</dd>
          </div>
        </dl>
      )}

      {canManage && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-xs leading-relaxed text-slate-500">
            Take this from the entry or your broker rather than working it out. The container
            material and the process are part of the code, so the same commodity packed differently
            is a different code.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={7}
              className={`${inputClass} mt-0 flex-1 font-mono`}
              placeholder="38BEE27"
            />
            <button
              type="button"
              onClick={save}
              disabled={pending || code.trim().length < 5 || code.trim() === (current.code ?? "")}
              className={buttonClass}
            >
              {pending ? "Checking…" : "Record and verify"}
            </button>
          </div>

          {/* Six characters: industry, class and group sit at fixed positions,
              but the one character left over could be either element and FDA's
              format does not say which. Asking beats filing a container code
              as a process code. */}
          {ambiguous && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">Which element is the middle character?</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900">
                Fill in one of these — whichever the code actually carries.
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  Subclass (container material)
                  <input
                    value={subclass}
                    onChange={(event) => { setSubclass(event.target.value.toUpperCase()); setPic(""); }}
                    maxLength={1}
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  PIC (process)
                  <input
                    value={pic}
                    onChange={(event) => { setPic(event.target.value.toUpperCase()); setSubclass(""); }}
                    maxLength={1}
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
              <p className="font-semibold">{error}</p>
              {reasons.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {reasons.map((reason) => <li key={reason}>• {reason}</li>)}
                </ul>
              )}
            </div>
          )}
          {note && <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{note}</p>}
        </div>
      )}
    </section>
  );
}
