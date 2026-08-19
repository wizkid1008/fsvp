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
import { BadgeCheck, HelpCircle, Search } from "lucide-react";
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

function cellText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function rowValue(row: Record<string, string | null>, patterns: RegExp[]): string | null {
  return Object.entries(row).find(([key, value]) =>
    Boolean(cellText(value) && patterns.some((pattern) => pattern.test(key)))
  )?.[1] ?? null;
}

export function ProductFdaCodeCard({
  productId,
  productName,
  current,
  canManage,
}: {
  productId: string;
  productName: string;
  current: ProductFdaCode;
  canManage: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState(current.code ?? "");
  const [lookupTerm, setLookupTerm] = useState(productName);
  const [lookupRows, setLookupRows] = useState<Array<Record<string, string | null>> | null>(null);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [industryRows, setIndustryRows] = useState<Array<{ id: string; name: string }> | null>(null);
  const [industryId, setIndustryId] = useState("");
  const [industryFilter, setIndustryFilter] = useState(productName);
  const [industryNote, setIndustryNote] = useState<string | null>(null);
  const [subclass, setSubclass] = useState("");
  const [pic, setPic] = useState("");
  /** Set when FDA's format cannot say whether the middle character is subclass or PIC. */
  const [ambiguous, setAmbiguous] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function codeFromRow(row: Record<string, string | null>): string | null {
    const direct = Object.entries(row).find(([key, value]) =>
      Boolean(
        cellText(value) &&
        /code/i.test(key) &&
        !/id/i.test(key) &&
        /^[0-9]{2}[A-Z][0-9A-Z-]{2,4}$/i.test(cellText(value)!)
      )
    )?.[1];
    if (direct) return String(direct).toUpperCase();

    const values = Object.values(row).map(cellText).filter((value): value is string => Boolean(value));
    return values.find((value) => /^[0-9]{2}[A-Z][0-9A-Z-]{2,4}$/i.test(value.trim()))?.toUpperCase() ?? null;
  }

  function partialCodeFromRow(row: Record<string, string | null>): string | null {
    const industry = rowValue(row, [/industry.*(id|code)/i, /^industry$/i]);
    const klass = rowValue(row, [/class.*(id|code)$/i, /^class$/i]);
    const group = rowValue(row, [/product.*group/i, /group.*code/i]);
    if (!industry && !klass && !group) return null;
    return [
      industry ? industry.padStart(2, "0") : "??",
      klass?.toUpperCase() ?? "?",
      "…",
      group?.toUpperCase() ?? "??",
    ].join("");
  }

  function productLabel(row: Record<string, string | null>): string {
    const preferred = Object.entries(row).find(([key, value]) =>
      Boolean(cellText(value) && /(product|name|description)/i.test(key) && !/code/i.test(key))
    )?.[1];
    if (preferred) return String(preferred);
    return Object.values(row).map(cellText).filter(Boolean).join(" — ");
  }

  function lookup() {
    const term = lookupTerm.trim();
    if (term.length < 2) {
      setLookupNote("Enter at least two characters.");
      return;
    }
    setLookupRows(null);
    setLookupNote(null);
    setError(null);
    setReasons([]);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/products/fda-code/search?name=${encodeURIComponent(term)}`);
        const json = await res.json().catch(() => ({})) as {
          error?: string;
          rows?: Array<Record<string, string | null>>;
          truncated?: boolean;
          tried?: string[];
        };
        if (!res.ok) {
          setLookupNote(json.error ?? "FDA Product Code Builder lookup is unavailable.");
          return;
        }
        const rows = json.rows ?? [];
        setLookupRows(rows);
        const tried = (json.tried ?? []).filter(Boolean).join(", ");
        setLookupNote(
          rows.length === 0
            ? `FDA returned no product names. Tried: ${tried || term}. Try a broader term, such as coffee.`
            : json.truncated
              ? "Showing the first matches. Narrow the search if needed."
              : null
        );
      } catch {
        setLookupNote("Could not reach the server.");
      }
    });
  }

  function loadIndustries() {
    setIndustryNote(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/products/fda-code/industries");
        const json = await res.json().catch(() => ({})) as {
          error?: string;
          rows?: Array<{ id: string; name: string }>;
          source_count?: number;
        };
        if (!res.ok) {
          setIndustryNote(json.error ?? "FDA industry lookup is unavailable.");
          return;
        }
        const rows = json.rows ?? [];
        setIndustryRows(rows);
        setIndustryNote(
          rows.length === 0
            ? `FDA returned ${json.source_count ?? 0} industry rows, but the app could not read the industry codes.`
            : null
        );
      } catch {
        setIndustryNote("Could not reach the server.");
      }
    });
  }

  function searchIndustry() {
    if (!industryId) {
      setIndustryNote("Choose an FDA industry first.");
      return;
    }
    setLookupRows(null);
    setLookupNote(null);
    setIndustryNote(null);
    setError(null);
    setReasons([]);

    const params = new URLSearchParams({ industry: industryId });
    if (industryFilter.trim()) params.set("filter", industryFilter.trim());

    startTransition(async () => {
      try {
        const res = await fetch(`/api/products/fda-code/industry-search?${params.toString()}`);
        const json = await res.json().catch(() => ({})) as {
          error?: string;
          rows?: Array<Record<string, string | null>>;
          total?: number;
          truncated?: boolean;
          fallback?: boolean;
          source_count?: number;
        };
        if (!res.ok) {
          setIndustryNote(json.error ?? "FDA industry search is unavailable.");
          return;
        }
        const rows = json.rows ?? [];
        setLookupRows(rows);
        const hasFilter = industryFilter.trim().length > 0;
        setIndustryNote(
          rows.length === 0
            ? hasFilter
              ? "FDA returned no products in that industry for the filter. Try removing a word."
              : `FDA returned ${json.source_count ?? 0} products for that industry. Try another industry.`
            : json.fallback
              ? "No exact filter match. Showing broader results from the selected industry."
            : json.truncated
              ? `Showing first ${rows.length} of ${json.total ?? "many"} matches. Add a filter to narrow it.`
              : null
        );
      } catch {
        setIndustryNote("Could not reach the server.");
      }
    });
  }

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
            Use the code from the entry line or broker when you have it. If not, search FDA Product
            Code Builder by product name, then confirm the result against packaging and processing
            details before recording it.
          </p>

          <div className="mt-3 rounded-md border border-line bg-slate-50 p-3">
            <label className={labelClass}>
              Search FDA Product Code Builder
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <input
                  value={lookupTerm}
                  onChange={(event) => setLookupTerm(event.target.value)}
                  className={`${inputClass} mt-0 flex-1`}
                  placeholder="Green coffee beans"
                />
                <button
                  type="button"
                  onClick={lookup}
                  disabled={pending || lookupTerm.trim().length < 2}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  <Search className="h-4 w-4" />
                  Search FDA
                </button>
              </div>
            </label>

            {lookupNote && <p className="mt-2 text-xs leading-relaxed text-slate-500">{lookupNote}</p>}

            {lookupRows && lookupRows.length > 0 && (
              <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-line bg-white">
                {lookupRows.map((row, index) => {
                  const rowCode = codeFromRow(row);
                  const partialCode = partialCodeFromRow(row);
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        if (rowCode) {
                          setCode(rowCode);
                          setLookupNote(null);
                        } else {
                          setLookupNote(
                            "That FDA result identifies the product family, but not the full entry-line code. " +
                            "Confirm subclass and process with the entry or broker before recording."
                          );
                        }
                      }}
                      className="grid w-full gap-1 border-b border-line px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:grid-cols-[8rem_1fr]"
                    >
                      <span className="font-mono font-semibold text-forest">{rowCode ?? partialCode ?? "Reference"}</span>
                      <span className="text-slate-700">{productLabel(row)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-4 border-t border-line pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">Browse by FDA industry</p>
                {!industryRows && (
                  <button
                    type="button"
                    onClick={loadIndustries}
                    disabled={pending}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-line bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Load industries
                  </button>
                )}
              </div>

              {industryRows && (
                <div className="mt-2 grid gap-2 lg:grid-cols-[1.2fr_1fr_auto]">
                  <select
                    value={industryId}
                    onChange={(event) => setIndustryId(event.target.value)}
                    className={`${inputClass} mt-0`}
                  >
                    <option value="">Select FDA industry</option>
                    {industryRows.map((industry) => (
                      <option key={industry.id} value={industry.id}>
                        {industry.name} - {industry.id}
                      </option>
                    ))}
                  </select>
                  <input
                    value={industryFilter}
                    onChange={(event) => setIndustryFilter(event.target.value)}
                    className={`${inputClass} mt-0`}
                    placeholder="Optional filter"
                  />
                  <button
                    type="button"
                    onClick={searchIndustry}
                    disabled={pending || !industryId}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    <Search className="h-4 w-4" />
                    Browse
                  </button>
                </div>
              )}

              {industryNote && <p className="mt-2 text-xs leading-relaxed text-slate-500">{industryNote}</p>}
            </div>
          </div>

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
