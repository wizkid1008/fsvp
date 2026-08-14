"use client";

/**
 * Records whether a food is actually imported.
 *
 * Deliberately not part of the Edit Product form. Marking a product
 * discontinued starts a two-year retention clock under 21 CFR 1.510, and
 * marking one never-imported asserts that no FSVP obligation ever attached to
 * it. Those are status changes with legal weight, not attribute edits, and
 * burying them among name and allergen fields invites someone to change one by
 * accident.
 *
 * The platform cannot know whether a food was imported before this system
 * existed, so the caller asserts it — and the API refuses the assertion when
 * FSVP records prove otherwise. That refusal is explained here rather than
 * shown as a bare error, because the person seeing it is usually right about
 * their intent and wrong about which state expresses it.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import {
  LIFECYCLE_LABEL,
  lifecycleExplanation,
  retentionEndsOn,
  type ProductLifecycle,
} from "@/lib/fsvp/product-lifecycle";

const CHOICES: Array<{ value: ProductLifecycle; blurb: string }> = [
  { value: "active",       blurb: "We import this food. The full FSVP obligation applies." },
  { value: "not_imported", blurb: "We have never imported this food. No FSVP obligation ever attached to it." },
  { value: "discontinued", blurb: "We used to import this food and have stopped. Its records are retained for two years." },
];

export function ProductLifecycleDialog({
  product,
  onClose,
}: {
  product: { id: string; product_name: string; lifecycle: ProductLifecycle; discontinued_on: string | null };
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<ProductLifecycle>(product.lifecycle);
  const [stoppedOn, setStoppedOn] = useState(product.discontinued_on?.slice(0, 10) ?? "");
  const [reason, setReason] = useState("");
  const [confirmedNeverImported, setConfirmedNeverImported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refusedByRecords, setRefusedByRecords] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const unchanged = target === product.lifecycle;
  const needsDate = target === "discontinued";
  const needsConfirmation = target === "not_imported";
  const blocked =
    unchanged ||
    (needsDate && !stoppedOn) ||
    (needsConfirmation && !confirmedNeverImported);

  // What the retention clock will say once this is saved, shown before the user
  // commits rather than after — the date is the consequence, so it belongs next
  // to the decision.
  const projectedRetentionEnd = needsDate && stoppedOn
    ? retentionEndsOn({ lifecycle: "discontinued", discontinuedOn: stoppedOn })
    : null;

  function submit() {
    setError(null);
    setRefusedByRecords(false);

    startTransition(async () => {
      try {
        const response = await fetch("/api/products/lifecycle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: product.id,
            lifecycle: target,
            discontinued_on: needsDate ? stoppedOn : undefined,
            // The assertion the platform cannot make for itself. "Never
            // imported" is the only state that claims no obligation ever
            // existed, so it is the only one that asserts false.
            ever_imported: target !== "not_imported",
            reason: reason.trim() || undefined,
          }),
        });

        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          setError(body.error ?? "That change could not be saved.");
          setRefusedByRecords(Boolean(body.has_fsvp_records));
          return;
        }

        router.refresh();
        onClose();
      } catch {
        setError("That change could not be saved. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-lg border border-line bg-white shadow-lg">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Do you import this food?</h2>
            <p className="mt-0.5 text-sm text-slate-500">{product.product_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-sm text-slate-600">{lifecycleExplanation(product)}</p>

          <fieldset className="space-y-2">
            <legend className="sr-only">Product state</legend>
            {CHOICES.map((choice) => (
              <label
                key={choice.value}
                className={`flex cursor-pointer gap-3 rounded-md border px-3 py-2.5 transition ${
                  target === choice.value
                    ? "border-forest bg-forest/5"
                    : "border-line hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="lifecycle"
                  value={choice.value}
                  checked={target === choice.value}
                  onChange={() => {
                    setTarget(choice.value);
                    setError(null);
                    setRefusedByRecords(false);
                  }}
                  className="mt-1 h-4 w-4 shrink-0 accent-forest"
                />
                <span>
                  <span className="block text-sm font-medium text-ink">{LIFECYCLE_LABEL[choice.value]}</span>
                  <span className="block text-xs text-slate-500">{choice.blurb}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {needsDate && (
            <label className="block text-sm font-medium text-slate-700">
              Date you stopped importing
              <input
                type="date"
                value={stoppedOn}
                max={today}
                onChange={(event) => setStoppedOn(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-forest"
              />
              <span className="mt-1 block text-xs text-slate-500">
                {projectedRetentionEnd
                  ? `Records retained until ${projectedRetentionEnd} under 21 CFR 1.510.`
                  : "The two-year retention period runs from this date, not from today."}
              </span>
            </label>
          )}

          {needsConfirmation && (
            <label className="flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
              <input
                type="checkbox"
                checked={confirmedNeverImported}
                onChange={(event) => setConfirmedNeverImported(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-forest"
              />
              <span className="text-xs text-amber-900">
                I confirm this food has never been imported. If it was imported and later stopped,
                choose Discontinued instead — its records must be kept for two years.
              </span>
            </label>
          )}

          <label className="block text-sm font-medium text-slate-700">
            Reason <span className="font-normal text-slate-400">(optional)</span>
            <input
              type="text"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. added before the supplier relationship existed"
              className="mt-1.5 h-10 w-full rounded-md border border-line px-3 text-sm outline-none focus:border-forest"
            />
            <span className="mt-1 block text-xs text-slate-500">Recorded in the audit log with your name and the date.</span>
          </label>

          {error && (
            <div className="flex gap-2.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <div className="text-xs text-rose-900">
                <p>{error}</p>
                {refusedByRecords && (
                  // The platform disagreed with the assertion and can say why:
                  // an FSVP record exists precisely because the food was being
                  // imported.
                  <p className="mt-1.5">
                    This product already has FSVP records, which exist because the food was being
                    imported. Choose <strong>Discontinued</strong> and give the date importing
                    stopped.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-line px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={blocked || pending}
            className="h-9 rounded-md bg-forest px-3 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
