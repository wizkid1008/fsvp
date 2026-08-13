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
}) {
  const router = useRouter();
  const [classification, setClassification] = useState(commodityId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
