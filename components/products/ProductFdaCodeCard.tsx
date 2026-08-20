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

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, HelpCircle, Search } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

export type ProductFdaCode = {
  code: string | null;
  subclass: string | null;
  pic: string | null;
  verified_at: string | null;
};

type FdaOption = { code: string; name: string };
type ProductChoice = { key: string; label: string; classCode: string; group: string };

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

function productLabel(row: Record<string, string | null>): string {
  const preferred = Object.entries(row).find(([key, value]) =>
    Boolean(cellText(value) && /(product|name|description)/i.test(key) && !/code/i.test(key))
  )?.[1];
  if (preferred) return String(preferred);
  return Object.values(row).map(cellText).filter(Boolean).join(" — ");
}

function visibleRowFields(row: Record<string, string | null>): Array<[string, string]> {
  return Object.entries(row)
    .map(([key, value]) => [key, cellText(value)?.trim() ?? ""] as [string, string])
    .filter(([, value]) => value.length > 0)
    .slice(0, 10);
}

function productCodeFromRow(row: Record<string, string | null>): string | null {
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

function normalizeProductGroup(value: string | null): string {
  const v = value?.trim().toUpperCase() ?? "";
  if (/^[A-Z0-9]{2}$/.test(v)) return v;
  if (/^[0-9]{2}[A-Z][0-9A-Z-]{2,4}$/.test(v)) return v.slice(-2);
  return "";
}

function productChoiceFromRow(row: Record<string, string | null>): ProductChoice | null {
  const text = Object.values(row).map(cellText).filter(Boolean).join(" ");
  const paren = text.match(/\(([A-Z])-([A-Z0-9]{2})\)/i);
  const fullCode = productCodeFromRow(row);
  const classCode = (
    rowValue(row, [/^class(_code|_id)?$/i, /product.*class/i]) ??
    fullCode?.[2] ??
    paren?.[1] ??
    ""
  ).toUpperCase();

  const group = normalizeProductGroup(
    rowValue(row, [/product.*group/i, /^group(_code|_id)?$/i, /^product(_code|_id)?$/i, /product.*(code|id)$/i]) ??
    fullCode ??
    paren?.[2] ??
    ""
  );

  if (!/^[A-Z]$/.test(classCode) || !/^[A-Z0-9]{2}$/.test(group)) return null;
  return { key: `${classCode}-${group}-${productLabel(row)}`, label: productLabel(row), classCode, group };
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
  const [industryRows, setIndustryRows] = useState<Array<{ id: string; name: string }> | null>(null);
  const [industryId, setIndustryId] = useState("");
  const [industryFilter, setIndustryFilter] = useState(productName);
  const [industryProductRows, setIndustryProductRows] = useState<Array<Record<string, string | null>>>([]);
  const [selectedProductKey, setSelectedProductKey] = useState("");
  const [subclassOptions, setSubclassOptions] = useState<FdaOption[]>([]);
  const [picOptions, setPicOptions] = useState<FdaOption[]>([]);
  const [selectedSubclass, setSelectedSubclass] = useState("");
  const [selectedPic, setSelectedPic] = useState("");
  const [finalRows, setFinalRows] = useState<Array<Record<string, string | null>> | null>(null);
  const [finalNote, setFinalNote] = useState<string | null>(null);
  const [industryNote, setIndustryNote] = useState<string | null>(null);
  const [subclass, setSubclass] = useState("");
  const [pic, setPic] = useState("");
  /** Set when FDA's format cannot say whether the middle character is subclass or PIC. */
  const [ambiguous, setAmbiguous] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (canManage && industryRows === null) loadIndustries();
  }, [canManage, industryRows]);

  useEffect(() => {
    if (!industryId || !selectedProduct) return;
    findFinalCodes(selectedProduct, selectedSubclass, selectedPic);
  }, [industryId, selectedProductKey, selectedSubclass, selectedPic]);

  function codeFromRow(row: Record<string, string | null>): string | null {
    return productCodeFromRow(row);
  }

  const productChoices = industryProductRows
    .map(productChoiceFromRow)
    .filter((choice): choice is ProductChoice => Boolean(choice));
  const selectedProduct = productChoices.find((choice) => choice.key === selectedProductKey) ?? null;

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

  function loadCodeOptions(nextIndustryId: string) {
    setSubclassOptions([]);
    setPicOptions([]);
    setSelectedSubclass("");
    setSelectedPic("");
    if (!nextIndustryId) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/products/fda-code/options?industry=${encodeURIComponent(nextIndustryId)}`);
        const json = await res.json().catch(() => ({})) as {
          error?: string;
          subclasses?: FdaOption[];
          pics?: FdaOption[];
        };
        if (!res.ok) {
          setIndustryNote(json.error ?? "FDA subclass and PIC options are unavailable.");
          return;
        }
        setSubclassOptions(json.subclasses ?? []);
        setPicOptions(json.pics ?? []);
      } catch {
        setIndustryNote("Could not reach the server.");
      }
    });
  }

  function searchIndustry(nextIndustryId = industryId, nextFilter = industryFilter) {
    if (!nextIndustryId) {
      setIndustryNote("Choose an FDA industry first.");
      return;
    }
    setIndustryNote(null);
    setIndustryProductRows([]);
    setSelectedProductKey("");
    setFinalRows(null);
    setFinalNote(null);
    setError(null);
    setReasons([]);

    const params = new URLSearchParams({ industry: nextIndustryId });
    if (nextFilter.trim()) params.set("filter", nextFilter.trim());

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
        const choices = rows.map(productChoiceFromRow).filter(Boolean);
        setIndustryProductRows(rows);
        const hasFilter = nextFilter.trim().length > 0;
        setIndustryNote(
          rows.length === 0
            ? hasFilter
              ? "FDA returned no products in that industry for the filter. Try removing a word."
              : `FDA returned ${json.source_count ?? 0} products for that industry. Try another industry.`
            : choices.length === 0
              ? "FDA returned broader rows for that industry, but none carried the class and product-group codes needed for the next step. Try clearing the filter or choose another industry."
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

  function findFinalCodes(
    product: ProductChoice | null = selectedProduct,
    nextSubclass = selectedSubclass,
    nextPic = selectedPic
  ) {
    if (!industryId || !product) {
      setFinalNote("Choose an FDA industry and product first.");
      return;
    }
    setFinalRows(null);
    setFinalNote(null);
    setError(null);
    setReasons([]);

    const params = new URLSearchParams({
      industry: industryId,
      class: product.classCode,
      group: product.group,
    });
    if (nextSubclass) params.set("subclass", nextSubclass);
    if (nextPic) params.set("pic", nextPic);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/products/fda-code/final-results?${params.toString()}`);
        const json = await res.json().catch(() => ({})) as {
          error?: string;
          rows?: Array<Record<string, string | null>>;
          truncated?: boolean;
        };
        if (!res.ok) {
          setFinalNote(json.error ?? "FDA final code lookup is unavailable.");
          return;
        }
        const rows = json.rows ?? [];
        setFinalRows(rows);
        setFinalNote(
          rows.length === 0
            ? "FDA returned no final codes for that combination. Try changing subclass or PIC."
            : json.truncated
              ? "Showing the first final matches. Narrow the selections if needed."
              : null
        );
      } catch {
        setFinalNote("Could not reach the server.");
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
            Use the code from the entry line or broker when you have it. If not, browse FDA's
            industry tables in order: industry, product code name, then packaging and process
            details. The final code still has to match the actual entry-line product.
          </p>

          <div className="mt-3 rounded-md border border-line bg-slate-50 p-3">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-ink">Browse by FDA industry</p>
                <div className="mt-2 grid gap-2 lg:grid-cols-[1.2fr_1fr_auto]">
                  <select
                    value={industryId}
                    onChange={(event) => {
                      const next = event.target.value;
                      setIndustryId(next);
                      setIndustryProductRows([]);
                      setSelectedProductKey("");
                      setFinalRows(null);
                      setFinalNote(null);
                      loadCodeOptions(next);
                      if (next) searchIndustry(next, industryFilter);
                    }}
                    className={`${inputClass} mt-0`}
                    disabled={!industryRows}
                  >
                    <option value="">{industryRows ? "Select FDA industry" : "Loading FDA industries..."}</option>
                    {(industryRows ?? []).map((industry) => (
                      <option key={industry.id} value={industry.id}>
                        {industry.name} - {industry.id}
                      </option>
                    ))}
                  </select>
                  <input
                    value={industryFilter}
                    onChange={(event) => setIndustryFilter(event.target.value)}
                    className={`${inputClass} mt-0`}
                    placeholder="Filter product code names"
                  />
                  <button
                    type="button"
                    onClick={() => searchIndustry()}
                    disabled={pending || !industryId}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    <Search className="h-4 w-4" />
                    Apply filter
                  </button>
                </div>
              </div>

              {industryId && (
                <div className="border-t border-line pt-4">
                  <p className="text-sm font-semibold text-ink">Product code names</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Choose the FDA product name that matches the food as described for entry.
                  </p>
                  {productChoices.length > 0 ? (
                    <select
                      value={selectedProductKey}
                      onChange={(event) => {
                        setSelectedProductKey(event.target.value);
                        setFinalRows(null);
                        setFinalNote(null);
                      }}
                      className={`${inputClass} mt-2`}
                    >
                      <option value="">Select product code name</option>
                      {productChoices.map((choice) => (
                        <option key={choice.key} value={choice.key}>
                          {choice.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-2 rounded-md border border-line bg-white px-3 py-2 text-sm text-slate-500">
                      {pending ? (
                        "Loading product code names..."
                      ) : industryProductRows.length > 0 ? (
                        <div className="space-y-3">
                          <div>
                            <p className="font-semibold text-ink">
                              FDA returned {industryProductRows.length} row{industryProductRows.length === 1 ? "" : "s"}.
                            </p>
                            <p className="mt-1 text-xs leading-relaxed">
                              These rows did not expose the class and product-group values this picker needs yet.
                              Showing the returned fields so we can map the next step correctly.
                            </p>
                          </div>
                          <div className="max-h-72 space-y-2 overflow-y-auto">
                            {industryProductRows.slice(0, 5).map((row, rowIndex) => {
                              const fields = visibleRowFields(row);
                              return (
                                <div key={rowIndex} className="rounded-md border border-line bg-slate-50 p-2">
                                  <p className="text-xs font-semibold text-slate-500">FDA row {rowIndex + 1}</p>
                                  {fields.length > 0 ? (
                                    <div className="mt-1 space-y-1">
                                      {fields.map(([key, value]) => (
                                        <div key={key} className="grid gap-1 sm:grid-cols-[10rem_1fr]">
                                          <span className="font-mono text-[11px] text-slate-500">{key}</span>
                                          <span className="text-xs text-slate-700">{value}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="mt-1 text-xs text-slate-500">This row had no displayable values.</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        "No product code names loaded for this industry yet."
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedProduct && (
                <div className="border-t border-line pt-4">
                  <p className="text-sm font-semibold text-ink">Packaging and process details</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Refine the code with subclass/container and PIC/process when those details apply.
                  </p>
                  <div className="mt-2 grid gap-2 lg:grid-cols-2">
                    <select
                      value={selectedSubclass}
                      onChange={(event) => {
                        setSelectedSubclass(event.target.value);
                        setFinalRows(null);
                        setFinalNote(null);
                      }}
                      className={`${inputClass} mt-0`}
                    >
                      <option value="">Any subclass/container</option>
                      {subclassOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.name} - {option.code}
                        </option>
                      ))}
                    </select>
                    <select
                      value={selectedPic}
                      onChange={(event) => {
                        setSelectedPic(event.target.value);
                        setFinalRows(null);
                        setFinalNote(null);
                      }}
                      className={`${inputClass} mt-0`}
                    >
                      <option value="">Any PIC/process</option>
                      {picOptions.map((option) => (
                        <option key={option.code} value={option.code}>
                          {option.name} - {option.code}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {industryNote && <p className="mt-2 text-xs leading-relaxed text-slate-500">{industryNote}</p>}
              {finalNote && <p className="mt-2 text-xs leading-relaxed text-slate-500">{finalNote}</p>}
              {finalRows && finalRows.length > 0 && (
                <div className="border-t border-line pt-4">
                  <p className="text-sm font-semibold text-ink">Matching product codes</p>
                  <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-line bg-white">
                    {finalRows.map((row, index) => {
                      const rowCode = codeFromRow(row);
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => rowCode && setCode(rowCode)}
                          disabled={!rowCode}
                          className="grid w-full gap-1 border-b border-line px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:grid-cols-[8rem_1fr]"
                        >
                          <span className="font-mono font-semibold text-forest">{rowCode ?? "No full code"}</span>
                          <span className="text-slate-700">{productLabel(row)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <label className={labelClass}>Already have the entry-line product code?</label>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Paste the code from the broker or entry line, then verify it against FDA before saving.
            </p>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
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
