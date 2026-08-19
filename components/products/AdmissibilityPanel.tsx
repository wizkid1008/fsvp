"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink, ShieldAlert } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AdmissibilityBlock } from "@/lib/admissibility/gate";
import type { StatusTone } from "@/types/platform";

export type ProductCommodityOption = {
  id: string;
  common_name: string;
  scientific_name: string | null;
  plant_part: string | null;
  is_propagative: boolean;
};

/**
 * The most recent "none of these fit" request for this product, if there is one.
 *
 * Kept on the panel rather than a screen of its own because the request only
 * means anything next to the dropdown that could not answer it.
 */
export type ClassificationRequestRow = {
  id: string;
  status: "open" | "resolved" | "declined";
  described_as: string;
  resolution_note: string | null;
  resolved_commodity_id: string | null;
  resolved_commodity_name: string | null;
  created_at: string;
};

export type AdmissibilityDeterminationRow = {
  id: string;
  intended_use: string;
  processing_state: string;
  outcome: "permitted" | "restricted" | "prohibited";
  citation: string;
  source_url: string;
  conditions: string[];
  determined_at: string;
  expires_at: string;
  is_current: boolean;
  rule_superseded: boolean;
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
const labelClass = "block text-sm font-medium text-slate-700";
const buttonClass =
  "inline-flex h-10 items-center justify-center rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60";

const commodityClasses = [
  ["fruit", "Fruit"],
  ["vegetable", "Vegetable"],
  ["nut", "Nut"],
  ["grain", "Grain"],
  ["herb_spice", "Herb or spice"],
  ["seafood", "Seafood"],
  ["meat_poultry", "Meat or poultry"],
  ["dairy", "Dairy"],
  ["egg", "Egg"],
  ["beverage", "Beverage"],
  ["processed_food", "Processed food"],
  ["supplement", "Supplement"],
  ["other", "Other"],
] as const;

const plantClassValues = new Set(["fruit", "vegetable", "nut", "grain", "herb_spice"]);

function outcomeTone(outcome: AdmissibilityDeterminationRow["outcome"]): StatusTone {
  if (outcome === "permitted") return "success";
  if (outcome === "restricted") return "warning";
  return "danger";
}

export function AdmissibilityPanel({
  productId,
  productName,
  commodityId,
  commodityName,
  countryOfOrigin,
  commodities,
  determinations,
  blockers,
  canManage,
  defaultUse,
  defaultState,
  classificationRequest,
}: {
  productId: string;
  productName: string;
  commodityId: string | null;
  commodityName: string | null;
  countryOfOrigin: string | null;
  commodities: ProductCommodityOption[];
  determinations: AdmissibilityDeterminationRow[];
  blockers: AdmissibilityBlock[];
  canManage: boolean;
  defaultUse: string;
  defaultState: string;
  classificationRequest: ClassificationRequestRow | null;
}) {
  const router = useRouter();
  // An administrator who has answered a request has already done the choosing.
  // Pre-selecting their commodity leaves the importer with one click, without
  // taking the classification decision away from them.
  const [classification, setClassification] = useState(
    commodityId ?? (classificationRequest?.status === "resolved"
      ? classificationRequest.resolved_commodity_id ?? ""
      : "")
  );
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [requesting, setRequesting] = useState(false);
  const [requestClass, setRequestClass] = useState("");
  const [pcbRows, setPcbRows] = useState<Array<Record<string, string | null>> | null>(null);
  const [pcbNote, setPcbNote] = useState<string | null>(null);

  const heading = useMemo(() => {
    if (blockers.some((block) => block.code === "prohibited")) {
      return { label: "Prohibited", tone: "danger" as StatusTone, icon: ShieldAlert };
    }
    if (blockers.length > 0) {
      return { label: "Action required", tone: "warning" as StatusTone, icon: AlertTriangle };
    }
    if (determinations.some((row) => row.outcome === "restricted")) {
      return { label: "Restricted — conditions apply", tone: "warning" as StatusTone, icon: CheckCircle2 };
    }
    return { label: "Current and permitted", tone: "success" as StatusTone, icon: CheckCircle2 };
  }, [blockers, determinations]);

  function classify() {
    setError(null);
    setReasons([]);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/products/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ product_id: productId, commodity_id: classification }),
        });
        const json = await res.json().catch(() => ({})) as { error?: string; commodity_name?: string };
        if (!res.ok) {
          setError(json.error ?? "Could not classify the product.");
          return;
        }
        setSuccess(`Classified as ${json.commodity_name ?? "the selected commodity"}.`);
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  /**
   * Look the description up in FDA's product code vocabulary.
   *
   * Advisory only — these are FDA product NAMES, not commodities and not an
   * admissibility answer. They are here so the importer and the administrator
   * end up describing the same thing in the same words.
   */
  function lookupPcb(term: string) {
    setPcbRows(null);
    setPcbNote(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/commodities/pcb-search?name=${encodeURIComponent(term)}`);
        const json = await res.json().catch(() => ({})) as {
          error?: string;
          rows?: Array<Record<string, string | null>>;
        };
        if (!res.ok) {
          setPcbNote(json.error ?? "FDA's product name lookup is unavailable.");
          return;
        }
        setPcbRows(json.rows ?? []);
        if ((json.rows ?? []).length === 0) setPcbNote("FDA has no product name matching that.");
      } catch {
        setPcbNote("Could not reach the server.");
      }
    });
  }

  function requestClassification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReasons([]);
    setSuccess(null);
    const form = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const res = await fetch("/api/commodities/classification-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            described_as: form.get("described_as"),
            commodity_class: form.get("commodity_class"),
            plant_part: form.get("plant_part") || undefined,
            is_propagative: form.get("is_propagative") === "on",
            notes: form.get("notes"),
          }),
        });
        const json = await res.json().catch(() => ({})) as { error?: string; commodity_name?: string };
        if (!res.ok) {
          setError(json.error ?? "Could not create the provisional commodity.");
          return;
        }
        setRequesting(false);
        setSuccess(`Created and classified as ${json.commodity_name ?? "a provisional commodity"}.`);
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  function determine(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReasons([]);
    setSuccess(null);
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admissibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            intended_use: form.get("intended_use"),
            processing_state: form.get("processing_state"),
            rationale: form.get("rationale"),
          }),
        });
        const json = await res.json().catch(() => ({})) as {
          error?: string;
          reasons?: string[];
          outcome?: string;
        };
        if (!res.ok) {
          setError(json.error ?? "Admissibility could not be determined.");
          setReasons(Array.isArray(json.reasons) ? json.reasons : []);
          return;
        }
        setSuccess(`Determination recorded: ${json.outcome ?? "complete"}.`);
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  const HeadingIcon = heading.icon;
  const requestIsPlantLike = plantClassValues.has(requestClass);

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Product admissibility</p>
          <h2 className="mt-1 text-base font-semibold text-ink">May this movement enter the United States?</h2>
        </div>
        <StatusBadge tone={heading.tone}>
          <HeadingIcon className="mr-1 h-3.5 w-3.5" /> {heading.label}
        </StatusBadge>
      </div>

      <dl className="mt-4 grid gap-3 rounded-md bg-slate-50 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Commodity</dt>
          <dd className="mt-1 font-medium text-ink">{commodityName ?? "Not classified"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Origin</dt>
          <dd className="mt-1 font-medium text-ink">{countryOfOrigin ?? "Not recorded"}</dd>
        </div>
      </dl>

      {blockers.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Approval blockers</p>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-amber-900">
            {blockers.map((block) => <li key={block.code}>• {block.message}</li>)}
          </ul>
        </div>
      )}

      {/* The taxonomy ships empty on purpose — see docs/reference-layer-curation.md:
          "an empty table is honest, a wrong table is dangerous". But an empty
          dropdown under a blocker saying "classify it first" is a dead end, and
          the whole path is behind it: no commodity means no admissibility, which
          means no FSVP record. Say so, and name who can fix it. */}
      {canManage && commodities.length === 0 && (
        <div className="mt-5 rounded-md border border-line bg-slate-50 px-4 py-4">
          <h3 className="text-sm font-semibold text-ink">The commodity taxonomy is empty</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Nothing can be classified until commodities are added to it. The taxonomy is curated
            rather than shipped — a country-commodity rule nobody has checked is worse than no rule
            at all, because it produces confident wrong answers.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            An administrator adds them under{" "}
            <a href="/admin/reference-rules" className="font-semibold text-forest hover:underline">
              Admin → Country-Commodity Rules
            </a>
            . If you are not an administrator, ask one to add the commodity for this product.
          </p>
        </div>
      )}

      {canManage && commodities.length > 0 && (
        <div className="mt-5 border-t border-line pt-5">
          <h3 className="text-sm font-semibold text-ink">1. Classify the product</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Reclassifying supersedes existing determinations because they answer a different commodity question.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select value={classification} onChange={(event) => setClassification(event.target.value)} className={`${inputClass} mt-0 flex-1`}>
              <option value="">Select commodity</option>
              {commodities.map((commodity) => (
                <option key={commodity.id} value={commodity.id}>
                  {commodity.common_name}
                  {commodity.plant_part && commodity.plant_part !== "not_applicable" ? ` — ${commodity.plant_part}` : ""}
                  {commodity.is_propagative ? " — propagative" : ""}
                </option>
              ))}
            </select>
            <button type="button" onClick={classify} disabled={pending || !classification || classification === commodityId} className={buttonClass}>
              Save classification
            </button>
          </div>

          {/* The dead end this closes: with no option but the dropdown, an
              importer whose product is not in the taxonomy either abandons it
              or picks the nearest wrong commodity. The second is worse — the
              determination that follows resolves against a rule for a different
              commodity and still arrives with a citation and an expiry. */}
              {classificationRequest?.status === "open" ? (
                <div className="mt-3 rounded-md border border-line bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-ink">A classification request is open</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    You described this as &ldquo;{classificationRequest.described_as}&rdquo; on{" "}
                    {classificationRequest.created_at.slice(0, 10)}. This older request still needs
                    a platform answer; new unlisted products can now create a provisional commodity
                    without waiting.
                  </p>
                </div>
          ) : classificationRequest?.status === "resolved" ? (
            <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-900">
                An administrator added {classificationRequest.resolved_commodity_name ?? "a commodity"}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-emerald-900">
                It is selected above. Classifying is still yours to do — the responsibility for the
                movement sits with you, not with whoever maintains the taxonomy.
              </p>
              {classificationRequest.resolution_note && (
                <p className="mt-2 text-xs leading-relaxed text-emerald-900">
                  Note: {classificationRequest.resolution_note}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-3">
              {classificationRequest?.status === "declined" && (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">Your last request was declined</p>
                  <p className="mt-1 text-sm leading-relaxed text-amber-900">
                    {classificationRequest.resolution_note}
                  </p>
                </div>
              )}
              {!requesting ? (
                <div className="rounded-md border border-dashed border-forest/40 bg-emerald-50/60 p-4">
                  <p className="text-sm font-semibold text-ink">Can&apos;t find the right commodity?</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">
                    Do not choose the closest match. Create a provisional commodity for this product
                    so you can keep working while the platform reviews the taxonomy later.
                  </p>
                  <button
                    type="button"
                    onClick={() => setRequesting(true)}
                    className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-forest bg-white px-3 text-sm font-semibold text-forest transition hover:bg-emerald-50"
                  >
                    None of these describe this product
                  </button>
                </div>
              ) : (
                <form onSubmit={requestClassification} className="rounded-md border border-line bg-slate-50 p-4">
                  <h4 className="text-sm font-semibold text-ink">Create a provisional commodity</h4>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Describe the material as it actually enters. The product will be classified to this
                    provisional entry right away, and the platform can review it later.
                  </p>

                  <label className={`${labelClass} mt-3`}>
                    What is it? <span className="text-red-500">*</span>
                    <input
                      name="described_as"
                      required
                      minLength={2}
                      className={inputClass}
                      placeholder={`e.g. ${productName}`}
                      onBlur={(event) => {
                        const value = event.currentTarget.value.trim();
                        if (value.length >= 2) lookupPcb(value);
                      }}
                    />
                  </label>

                  <label className={`${labelClass} mt-3`}>
                    Broad class <span className="text-red-500">*</span>
                    <select
                      name="commodity_class"
                      required
                      value={requestClass}
                      onChange={(event) => setRequestClass(event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select class</option>
                      {commodityClasses.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>

                  {(pcbRows || pcbNote) && (
                    <div className="mt-2 rounded-md border border-line bg-white p-3">
                      <p className="text-xs font-semibold text-slate-600">
                        FDA product names matching that
                      </p>
                      {pcbNote && <p className="mt-1 text-xs text-slate-500">{pcbNote}</p>}
                      {pcbRows && pcbRows.length > 0 && (
                        <>
                          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-slate-700">
                            {pcbRows.slice(0, 12).map((row, i) => (
                              <li key={i}>• {Object.values(row).filter(Boolean).join(" — ")}</li>
                            ))}
                          </ul>
                          <p className="mt-2 text-xs leading-relaxed text-slate-500">
                            FDA&apos;s wording, shown so you and the administrator describe the same
                            thing. These are product names, not commodities and not an admissibility
                            answer.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {requestIsPlantLike && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className={labelClass}>
                        Plant part
                        <select name="plant_part" className={inputClass} defaultValue="">
                          <option value="">Not sure</option>
                          {["not_applicable", "fruit", "leaf", "root", "seed", "stem", "flower", "whole_plant", "bulb", "tuber"]
                            .map((value) => (
                              <option key={value} value={value}>{value.replace(/_/g, " ")}</option>
                            ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 pt-7 text-sm font-medium text-slate-700">
                        <input name="is_propagative" type="checkbox" className="h-4 w-4 rounded border-line text-forest" />
                        Capable of growing
                      </label>
                    </div>
                  )}

                  <label className={`${labelClass} mt-3`}>
                    Anything else that identifies it
                    <textarea
                      name="notes"
                      rows={2}
                      className="mt-1.5 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-forest"
                      placeholder="Processing, variety, how it is packed"
                    />
                  </label>

                  <div className="mt-3 flex gap-2">
                    <button type="submit" disabled={pending} className={buttonClass}>
                      {pending ? "Creating…" : "Create and classify"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequesting(false)}
                      className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {canManage && commodityId && countryOfOrigin && (
        <form onSubmit={determine} className="mt-5 border-t border-line pt-5">
          <h3 className="text-sm font-semibold text-ink">2. Record a determination</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            The platform will resolve only verified, current rules and will refuse ambiguous or stale source data.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              Intended use
              <select name="intended_use" required className={inputClass} defaultValue={defaultUse}>
                <option value="" disabled>Select intended use</option>
                {[
                  ["consumption", "Consumption"],
                  ["processing", "Processing"],
                  ["propagation", "Propagation"],
                  ["research", "Research"],
                ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className={labelClass}>
              Processing state
              <select name="processing_state" required className={inputClass} defaultValue={defaultState}>
                <option value="" disabled>Select processing state</option>
                {["fresh", "frozen", "dried", "cooked", "canned", "other"].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <label className={`${labelClass} mt-3`}>
            Rationale or movement notes
            <textarea name="rationale" rows={2} className="mt-1.5 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-forest" placeholder={`Why this use and state apply to ${productName}`} />
          </label>
          <button type="submit" disabled={pending} className={`${buttonClass} mt-3`}>
            {pending ? "Checking rules…" : "Determine admissibility"}
          </button>
        </form>
      )}

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          <p className="font-semibold">{error}</p>
          {reasons.length > 0 && <ul className="mt-2 space-y-1">{reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>}
        </div>
      )}
      {success && <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}

      {determinations.length > 0 && (
        <div className="mt-5 border-t border-line pt-5">
          <h3 className="text-sm font-semibold text-ink">Recorded determinations</h3>
          <div className="mt-3 space-y-3">
            {determinations.map((row) => (
              <div key={row.id} className="rounded-md border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={outcomeTone(row.outcome)}>{row.outcome}</StatusBadge>
                  {!row.is_current && <StatusBadge tone="danger">Expired</StatusBadge>}
                  {row.rule_superseded && <StatusBadge tone="warning">Rule superseded</StatusBadge>}
                  <span className="text-slate-600">{row.intended_use}, {row.processing_state}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">Expires {row.expires_at} · {row.citation}</p>
                {row.conditions.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-slate-700">
                    {row.conditions.map((condition) => <li key={condition}>• {condition}</li>)}
                  </ul>
                )}
                <a href={row.source_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-forest hover:underline">
                  Source <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
