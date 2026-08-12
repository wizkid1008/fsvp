"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, CircleDashed, Scale, ScrollText, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  basesForOutcome,
  basisSpec,
  OUTCOME_LABEL,
  VERY_SMALL_IMPORTER_THRESHOLD,
  type ApplicabilityOutcome,
} from "@/lib/fsvp/applicability";
import type { StatusTone } from "@/types/platform";

export type EntitySizeRow = {
  id: string;
  food_scope: "human" | "animal";
  three_year_average: number;
  currency: string;
  determined_at: string;
  expires_at: string | null;
};

export type PairRow = {
  supplier_id: string;
  supplier_name: string;
  product_id: string;
  product_name: string;
  determination: {
    id: string;
    outcome: ApplicabilityOutcome;
    basis: string;
    citation: string;
    rationale: string;
    determined_at: string;
    expires_at: string | null;
    signer_name: string;
  } | null;
};

const OUTCOME_TONE: Record<ApplicabilityOutcome, StatusTone> = {
  in_scope: "info",
  modified: "warning",
  exempt:   "neutral",
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
const areaClass =
  "mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest";
const labelClass = "block text-sm font-medium text-slate-700";
const btnClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:opacity-60";

function Modal({
  title, icon: Icon, onClose, children,
}: {
  title: string; icon: React.ElementType; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-forest" />
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 transition hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function DetermineForm({
  pair, entitySizes, onClose,
}: {
  pair: PairRow; entitySizes: EntitySizeRow[]; onClose: () => void;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<ApplicabilityOutcome>("in_scope");
  const [basis, setBasis] = useState("standard");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options = useMemo(() => basesForOutcome(outcome), [outcome]);
  const spec = basisSpec(basis);
  const needsSize = spec?.requiresEntitySize === true;

  function pickOutcome(next: ApplicabilityOutcome) {
    setOutcome(next);
    // Keep basis and outcome in step — the server rejects a mismatch, but the
    // form should never let you build one in the first place.
    setBasis(basesForOutcome(next)[0]?.basis ?? "");
    setError(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const res = await fetch("/api/applicability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplier_id: pair.supplier_id,
            product_id: pair.product_id,
            outcome,
            basis,
            rationale: fd.get("rationale")?.toString().trim() ?? "",
            expires_at: fd.get("expires_at")?.toString() || undefined,
            entity_size_determination_id: needsSize
              ? fd.get("entity_size_determination_id")?.toString() || undefined
              : undefined,
          }),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Could not save the determination.");
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <Modal title="Determine how FSVP applies" icon={ScrollText} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-md border border-line bg-slate-50 px-3 py-2 text-sm">
          <p className="font-semibold text-ink">{pair.product_name}</p>
          <p className="text-slate-500">{pair.supplier_name}</p>
        </div>

        {pair.determination && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            This food already has a determination ({OUTCOME_LABEL[pair.determination.outcome]},{" "}
            {pair.determination.citation}). Saving supersedes it — the old one is kept and stays
            visible in the record.
          </div>
        )}

        <div>
          <span className={labelClass}>Outcome</span>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
            {(["in_scope", "modified", "exempt"] as ApplicabilityOutcome[]).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => pickOutcome(o)}
                className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${
                  outcome === o
                    ? "border-forest bg-emerald-50 text-forest"
                    : "border-line bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {OUTCOME_LABEL[o]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="basis">
            Basis <span className="text-red-600">*</span>
          </label>
          <select
            id="basis"
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            className={inputClass}
          >
            {options.map((b) => (
              <option key={b.basis} value={b.basis}>{b.label}</option>
            ))}
          </select>
          {spec && (
            <p className="mt-1.5 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">{spec.citation}</span> — {spec.description}
            </p>
          )}
        </div>

        {needsSize && (
          <div>
            <label className={labelClass} htmlFor="entity_size_determination_id">
              Supporting size determination <span className="text-red-600">*</span>
            </label>
            {entitySizes.length === 0 ? (
              <p className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                You have no entity size determination on file. Record your three-year average first —
                a very small importer claim with nothing behind it is not a determination.
              </p>
            ) : (
              <select id="entity_size_determination_id" name="entity_size_determination_id" required className={inputClass}>
                {entitySizes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.food_scope === "human" ? "Human food" : "Animal food"} ·{" "}
                    {s.currency} {Number(s.three_year_average).toLocaleString()} ·{" "}
                    {new Date(s.determined_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor="rationale">
            Rationale <span className="text-red-600">*</span>
          </label>
          <textarea
            id="rationale" name="rationale" rows={4} required className={areaClass}
            placeholder="Why is this the right determination for this food? A citation without reasoning is not a determination."
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="expires_at">Review by</label>
          <input id="expires_at" name="expires_at" type="date" className={inputClass} />
          <p className="mt-1 text-xs text-slate-500">
            Optional. After this date the determination stops counting and records depending on it
            cannot be approved until it is remade.
          </p>
        </div>

        <div className="rounded-md border border-line bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Saving signs this determination in your name as a qualified individual and records the
          date. It cannot be edited afterwards — only superseded.
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={pending || (needsSize && entitySizes.length === 0)} className={btnClass}>
            {pending ? "Signing…" : "Determine and sign"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EntitySizeForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [scope, setScope] = useState<"human" | "animal">("human");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const res = await fetch("/api/entity-size", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            food_scope: scope,
            three_year_average: Number(fd.get("three_year_average")),
            currency: fd.get("currency")?.toString() || "USD",
            basis_notes: fd.get("basis_notes")?.toString().trim() || undefined,
            expires_at: fd.get("expires_at")?.toString() || undefined,
          }),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Could not save.");
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <Modal title="Record your three-year average" icon={Scale} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          § 1.500 defines a very small importer by average annual sales of food — plus the market
          value of food acquired without sale — over the previous three years. This is the figure a
          qualified individual relies on when they determine that modified requirements apply.
        </p>

        <div>
          <span className={labelClass}>Food scope</span>
          <div className="mt-1.5 flex gap-2">
            {(["human", "animal"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setScope(s)}
                className={`h-9 rounded-md border px-4 text-sm font-semibold capitalize transition ${
                  scope === s ? "border-forest bg-emerald-50 text-forest" : "border-line bg-white text-slate-600"
                }`}>
                {s} food
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Threshold is {VERY_SMALL_IMPORTER_THRESHOLD[scope].toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
            {" "}before FDA inflation adjustment.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <div>
            <label className={labelClass} htmlFor="three_year_average">
              Three-year average <span className="text-red-600">*</span>
            </label>
            <input id="three_year_average" name="three_year_average" type="number" min="0" step="0.01" required className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="currency">Currency</label>
            <input id="currency" name="currency" defaultValue="USD" className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="basis_notes">How it was calculated</label>
          <textarea id="basis_notes" name="basis_notes" rows={3} className={areaClass}
            placeholder="Which years, what was included, and where the figure came from." />
        </div>

        <div>
          <label className={labelClass} htmlFor="expires_at">Reaffirm by</label>
          <input id="expires_at" name="expires_at" type="date" className={inputClass} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={pending} className={btnClass}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ApplicabilityClient({
  pairs, entitySizes, viewerIsActiveQi, canManageSize,
}: {
  pairs: PairRow[];
  entitySizes: EntitySizeRow[];
  viewerIsActiveQi: boolean;
  canManageSize: boolean;
}) {
  const [determining, setDetermining] = useState<PairRow | null>(null);
  const [sizing, setSizing] = useState(false);

  const undetermined = pairs.filter((p) => !p.determination).length;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {undetermined > 0 && (
          <p className="mr-auto text-sm text-slate-600">
            <span className="font-semibold text-ink">{undetermined}</span> of {pairs.length} foods
            have no determination. An FSVP record cannot be opened for them until one exists.
          </p>
        )}
        {canManageSize && (
          <button type="button" onClick={() => setSizing(true)}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest">
            <Scale className="h-4 w-4" />
            {entitySizes.length > 0 ? "Update three-year average" : "Record three-year average"}
          </button>
        )}
      </div>

      {pairs.length === 0 ? (
        <div className="rounded-lg border border-line bg-white px-6 py-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-ink">No foods to determine yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            Add an exporter and the products you import from them, and they will appear here for a
            qualified individual to assess.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Food</th>
                <th className="px-4 py-3 font-semibold">Applies</th>
                <th className="px-4 py-3 font-semibold">Basis</th>
                <th className="px-4 py-3 font-semibold">Determined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pairs.map((p) => {
                const d = p.determination;
                const spec = d ? basisSpec(d.basis) : null;
                const expired = d?.expires_at
                  ? d.expires_at < new Date().toISOString().slice(0, 10)
                  : false;

                return (
                  <tr key={p.product_id} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{p.product_name}</p>
                      <p className="text-xs text-slate-500">{p.supplier_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      {d ? (
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge tone={OUTCOME_TONE[d.outcome]}>{OUTCOME_LABEL[d.outcome]}</StatusBadge>
                          {expired && <StatusBadge tone="danger">Expired</StatusBadge>}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                          <CircleDashed className="h-3.5 w-3.5" /> Not determined
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {d ? (
                        <>
                          <p>{spec?.label ?? d.basis}</p>
                          <p className="text-xs text-slate-500">{d.citation}</p>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {d ? (
                        <>
                          <p>{new Date(d.determined_at).toLocaleDateString()}</p>
                          <p className="text-slate-500">{d.signer_name}</p>
                          {d.expires_at && (
                            <p className={expired ? "text-red-600" : "text-slate-500"}>
                              Review by {new Date(d.expires_at).toLocaleDateString()}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {viewerIsActiveQi ? (
                        <button type="button" onClick={() => setDetermining(p)}
                          className="text-xs font-semibold text-forest hover:underline">
                          {d ? "Supersede" : "Determine"}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">QI only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!viewerIsActiveQi && pairs.length > 0 && (
        <p className="text-sm text-slate-500">
          Only a registered, active qualified individual can make these determinations.
        </p>
      )}

      {determining && (
        <DetermineForm pair={determining} entitySizes={entitySizes} onClose={() => setDetermining(null)} />
      )}
      {sizing && <EntitySizeForm onClose={() => setSizing(false)} />}
    </div>
  );
}
