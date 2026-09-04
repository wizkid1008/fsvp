"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ClipboardCheck, Info, ShieldQuestion, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EVENT_TYPE_LABEL, findingSeverity, type RegulatoryEventType } from "@/lib/regulatory/sources";
import type { StatusTone } from "@/types/platform";

export type SourceStatus = {
  id: string;
  label: string;
  access: "public" | "credentialed" | "manual";
  caveat: string;
  cadence: string;
  referenceUrl: string;
  lastRefreshedAt: string | null;
  dataThrough: string | null;
};

export type FindingRow = {
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  facility_name: string | null;
  match_status: "candidate" | "confirmed" | "rejected";
  match_method: string;
  match_confidence: number;
  match_rationale: string;
  reviewed_at: string | null;
  reviewer_name: string | null;
  review_notes: string | null;
  event: {
    source: string;
    event_type: string;
    event_date: string | null;
    firm_name: string | null;
    firm_country: string | null;
    firm_address: string | null;
    product_description: string | null;
    summary: string;
    classification: string | null;
  };
};

export type ScreeningRow = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  conclusion: "no_adverse_history" | "adverse_history_accepted" | "adverse_history_blocking";
  rationale: string;
  confirmed_event_count: number;
  screened_at: string;
  expires_at: string | null;
  screener_name: string;
};

export type SupplierOption = { id: string; name: string };

const btnClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:opacity-60";
const ghostBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-line bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60";
const areaClass =
  "mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest";
const labelClass = "block text-sm font-medium text-slate-700";
const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";

const SEVERITY_TONE: Record<"critical" | "warning" | "info", StatusTone> = {
  critical: "danger",
  warning:  "warning",
  info:     "neutral",
};

const CONCLUSION_LABEL: Record<ScreeningRow["conclusion"], string> = {
  no_adverse_history:       "No adverse history",
  adverse_history_accepted: "Adverse history — accepted",
  adverse_history_blocking: "Adverse history — blocking",
};

const CONCLUSION_TONE: Record<ScreeningRow["conclusion"], StatusTone> = {
  no_adverse_history:       "success",
  adverse_history_accepted: "warning",
  adverse_history_blocking: "danger",
};

function methodLabel(method: string): string {
  switch (method) {
    case "fei_exact":          return "Exact — FDA establishment identifier";
    case "name_country_exact": return "Name and country match";
    case "name_country_fuzzy": return "Name resembles";
    case "manual":             return "Added by hand";
    default:                   return method;
  }
}

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

/**
 * How current the data is, stated plainly at the top.
 *
 * This banner is not decoration. A compliance screen that shows no findings is
 * making a claim, and the claim is only as good as the last refresh — so the
 * page says when that was, and names the sources it does not cover at all.
 */
function Freshness({ sources }: { sources: SourceStatus[] }) {
  const uncovered = sources.filter((s) => !s.lastRefreshedAt);

  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <h3 className="text-sm font-semibold text-ink">Where this comes from</h3>
      <div className="mt-3 space-y-2.5">
        {sources.map((s) => (
          <div key={s.id} className="border-b border-line pb-2.5 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <a
                href={s.referenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-forest underline underline-offset-2"
              >
                {s.label}
              </a>
              {s.lastRefreshedAt ? (
                <span className="text-xs text-slate-600">
                  Refreshed {new Date(s.lastRefreshedAt).toLocaleDateString()}
                  {s.dataThrough ? ` · data through ${s.dataThrough}` : ""}
                </span>
              ) : (
                <StatusBadge tone="neutral">
                  {s.access === "manual" ? "No API — check by hand" : "Not configured"}
                </StatusBadge>
              )}
            </div>
            {/* FDA's own disclaimer, next to the data rather than buried in
                documentation. What a dataset does not mean is as important as
                what it does. */}
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              <span className="font-medium text-slate-600">{s.cadence}</span> — {s.caveat}
            </p>
          </div>
        ))}
      </div>

      {uncovered.length > 0 && (
        <p className="mt-4 flex gap-2 rounded-md bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {uncovered.length} of {sources.length} sources are not covered here, so a supplier with no
            findings below has not been cleared against everything FDA publishes.
            {uncovered.some((s) => s.access === "manual") &&
              " Import alerts in particular have no API and must be checked by hand at FDA's site."}
          </span>
        </p>
      )}
    </div>
  );
}

function FindingCard({
  finding, canDecide, onDecided,
}: {
  finding: FindingRow; canDecide: boolean; onDecided: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const severity = findingSeverity(finding.event.event_type, finding.event.classification);
  const label = EVENT_TYPE_LABEL[finding.event.event_type as RegulatoryEventType] ?? "Compliance action";
  const target = finding.supplier_name ?? finding.facility_name ?? "Unknown";

  function decide(decision: "confirmed" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/regulatory/matches/${finding.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, notes: notes.trim() || undefined }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "Could not record that decision.");
          return;
        }
        onDecided();
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={SEVERITY_TONE[severity]}>{label}</StatusBadge>
            {finding.event.classification && (
              <StatusBadge tone="neutral">{finding.event.classification}</StatusBadge>
            )}
            {finding.event.event_date && (
              <span className="text-xs text-slate-500">{finding.event.event_date}</span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink">{finding.event.summary}</p>
        </div>
        {finding.match_status !== "candidate" && (
          <StatusBadge tone={finding.match_status === "confirmed" ? "danger" : "neutral"}>
            {finding.match_status === "confirmed" ? "Confirmed as theirs" : "Not this supplier"}
          </StatusBadge>
        )}
      </div>

      {/* The two firms side by side. The reviewer's whole job is comparing
          these, so they are shown rather than summarised into a score. */}
      <div className="mt-4 grid gap-3 rounded-md bg-slate-50 p-3 text-xs sm:grid-cols-2">
        <div>
          <p className="font-semibold uppercase tracking-wide text-slate-500">FDA record names</p>
          <p className="mt-1 font-medium text-ink">{finding.event.firm_name ?? "—"}</p>
          {finding.event.firm_address && <p className="text-slate-600">{finding.event.firm_address}</p>}
          {finding.event.firm_country && <p className="text-slate-600">{finding.event.firm_country}</p>}
          {finding.event.product_description && (
            <p className="mt-1.5 line-clamp-3 text-slate-600">{finding.event.product_description}</p>
          )}
        </div>
        <div>
          <p className="font-semibold uppercase tracking-wide text-slate-500">Your record</p>
          <p className="mt-1 font-medium text-ink">{target}</p>
          <p className="mt-1.5 text-slate-600">
            {methodLabel(finding.match_method)} · {Math.round(finding.match_confidence * 100)}% confidence
          </p>
        </div>
      </div>

      <p className="mt-3 flex gap-2 text-xs leading-relaxed text-slate-600">
        <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span>{finding.match_rationale}</span>
      </p>

      {finding.match_status === "candidate" && canDecide && (
        <div className="mt-4 border-t border-line pt-4">
          <label className={labelClass} htmlFor={`notes-${finding.id}`}>
            Notes <span className="font-normal text-slate-500">(optional — what you checked)</span>
          </label>
          <textarea
            id={`notes-${finding.id}`}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={areaClass}
            placeholder="e.g. Address matches the facility on their registration; same product line."
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => decide("confirmed")} disabled={pending} className={btnClass}>
              <Check className="h-4 w-4" />
              This is our supplier
            </button>
            <button onClick={() => decide("rejected")} disabled={pending} className={ghostBtn}>
              <X className="h-4 w-4" />
              Not our supplier
            </button>
          </div>
        </div>
      )}

      {finding.match_status !== "candidate" && finding.reviewed_at && (
        <p className="mt-3 border-t border-line pt-3 text-xs text-slate-500">
          Reviewed by {finding.reviewer_name ?? "someone"} on{" "}
          {new Date(finding.reviewed_at).toLocaleDateString()}
          {finding.review_notes ? ` — ${finding.review_notes}` : ""}
        </p>
      )}
    </div>
  );
}

function ScreeningForm({
  suppliers, confirmedBySupplier, onClose, initialSupplierId,
}: {
  suppliers: SupplierOption[];
  confirmedBySupplier: Map<string, number>;
  onClose: () => void;
  /** The supplier the reader arrived asking about, when they named one. */
  initialSupplierId?: string;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(
    // Only honour it if it is really on the list — a stale link should open on
    // the usual default rather than on an empty select.
    (initialSupplierId && suppliers.some((s) => s.id === initialSupplierId)
      ? initialSupplierId
      : suppliers[0]?.id) ?? ""
  );
  const [conclusion, setConclusion] = useState<ScreeningRow["conclusion"]>("no_adverse_history");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmedCount = confirmedBySupplier.get(supplierId) ?? 0;

  // The server refuses this combination outright; saying so here saves the
  // reviewer writing a rationale that is about to be rejected.
  const contradicts = conclusion === "no_adverse_history" && confirmedCount > 0;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const res = await fetch("/api/regulatory/screenings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplier_id: supplierId,
            conclusion,
            rationale: fd.get("rationale")?.toString().trim() ?? "",
            adverse_findings: fd.get("adverse_findings")?.toString().trim() || undefined,
            expires_at: fd.get("expires_at")?.toString() || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "Could not record the screening.");
          return;
        }
        onClose();
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <Modal title="Record a compliance screening" icon={ClipboardCheck} onClose={onClose}>
      <p className="mb-4 text-sm leading-relaxed text-slate-600">
        § 1.505(a)(1)(iv) requires you to consider a supplier&apos;s FDA compliance history when you
        evaluate them, and § 1.505(b) requires a qualified individual to do it. This records that you
        looked, what you found, and what you concluded.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="supplier">Supplier</label>
          <select
            id="supplier"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className={inputClass}
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">
            {confirmedCount === 0
              ? "No confirmed FDA findings on record for this supplier."
              : `${confirmedCount} confirmed FDA finding${confirmedCount === 1 ? "" : "s"} on record.`}
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="conclusion">Conclusion</label>
          <select
            id="conclusion"
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value as ScreeningRow["conclusion"])}
            className={inputClass}
          >
            <option value="no_adverse_history">No adverse history found</option>
            <option value="adverse_history_accepted">Adverse history found — acceptable</option>
            <option value="adverse_history_blocking">Adverse history found — blocking</option>
          </select>
          {contradicts && (
            <p className="mt-2 rounded-md bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
              This supplier has {confirmedCount} confirmed finding{confirmedCount === 1 ? "" : "s"}, so
              the screening cannot conclude there is no adverse history. Choose whether it is
              acceptable or blocking.
            </p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="adverse_findings">
            Findings <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea id="adverse_findings" name="adverse_findings" rows={2} className={areaClass}
            placeholder="What you found, in your own words." />
        </div>

        <div>
          <label className={labelClass} htmlFor="rationale">Rationale</label>
          <textarea id="rationale" name="rationale" rows={3} required className={areaClass}
            placeholder="What you reviewed, which sources, and why you reached this conclusion." />
        </div>

        <div>
          <label className={labelClass} htmlFor="expires_at">
            Valid until <span className="font-normal text-slate-500">(defaults to one year)</span>
          </label>
          <input id="expires_at" name="expires_at" type="date" className={inputClass} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={pending || contradicts || !supplierId} className={btnClass}>
          {pending ? "Recording…" : "Record screening"}
        </button>
      </form>
    </Modal>
  );
}

export function ComplianceHistoryClient({
  sources, findings, screenings, suppliers, viewerIsActiveQi, canDecide, focusSupplierId,
}: {
  sources: SourceStatus[];
  findings: FindingRow[];
  screenings: ScreeningRow[];
  suppliers: SupplierOption[];
  viewerIsActiveQi: boolean;
  canDecide: boolean;
  /**
   * Set from ?supplier= when the reader arrived from a blocker naming one.
   * The pipeline says "Andes Ingredients: screening not recorded"; landing on
   * the queue with a Record screening button to hunt for makes them ask for the
   * same thing twice. Opens the form on that supplier instead.
   */
  focusSupplierId?: string;
}) {
  const [tab, setTab] = useState<"queue" | "confirmed" | "screenings">("queue");
  const [screening, setScreening] = useState(
    Boolean(focusSupplierId && canDecide && suppliers.some((s) => s.id === focusSupplierId))
  );
  const [decided, setDecided] = useState<Set<string>>(new Set());

  const candidates = useMemo(
    () => findings
      .filter((f) => f.match_status === "candidate" && !decided.has(f.id))
      .sort((a, b) => b.match_confidence - a.match_confidence),
    [findings, decided]
  );
  const confirmed = useMemo(
    () => findings.filter((f) => f.match_status === "confirmed"),
    [findings]
  );

  const confirmedBySupplier = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of confirmed) {
      if (!f.supplier_id) continue;
      m.set(f.supplier_id, (m.get(f.supplier_id) ?? 0) + 1);
    }
    return m;
  }, [confirmed]);

  const tabs = [
    { key: "queue"      as const, label: `To review (${candidates.length})` },
    { key: "confirmed"  as const, label: `Confirmed history (${confirmed.length})` },
    { key: "screenings" as const, label: `Screenings (${screenings.length})` },
  ];

  return (
    <div className="mt-6 space-y-6">
      <Freshness sources={sources} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-white p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={
                "rounded-md px-3 py-1.5 text-sm font-medium transition " +
                (tab === t.key ? "bg-forest text-white" : "text-slate-600 hover:bg-slate-50")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {viewerIsActiveQi && suppliers.length > 0 && (
          <button onClick={() => setScreening(true)} className={btnClass}>
            <ClipboardCheck className="h-4 w-4" />
            Record a screening
          </button>
        )}
      </div>

      {tab === "queue" && (
        candidates.length === 0 ? (
          <div className="rounded-lg border border-line bg-white px-6 py-10 text-center">
            <p className="text-sm text-slate-600">
              Nothing waiting. New FDA records that resemble one of your suppliers will appear here
              for you to confirm or dismiss before they count as their history.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="flex gap-2 rounded-md border border-line bg-white p-3 text-xs leading-relaxed text-slate-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                These FDA records resemble one of your suppliers by name and country. Company names
                are not unique identifiers, so nothing here counts as your supplier&apos;s history
                until you confirm it. Check the firm address and product against what you know before
                deciding.
              </span>
            </p>
            {candidates.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                canDecide={canDecide}
                onDecided={() => setDecided((prev) => new Set(prev).add(f.id))}
              />
            ))}
          </div>
        )
      )}

      {tab === "confirmed" && (
        confirmed.length === 0 ? (
          <div className="rounded-lg border border-line bg-white px-6 py-10 text-center">
            <p className="text-sm text-slate-600">
              No FDA findings have been confirmed against your suppliers.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {confirmed.map((f) => (
              <FindingCard key={f.id} finding={f} canDecide={false} onDecided={() => {}} />
            ))}
          </div>
        )
      )}

      {tab === "screenings" && (
        screenings.length === 0 ? (
          <div className="rounded-lg border border-line bg-white px-6 py-10 text-center">
            <p className="text-sm text-slate-600">
              No screenings recorded yet. A qualified individual records one per supplier to show
              their compliance history was considered — § 1.505(a)(1)(iv).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[42rem] text-sm">
              <thead className="border-b border-line bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold">Conclusion</th>
                  <th className="px-4 py-3 font-semibold">Findings</th>
                  <th className="px-4 py-3 font-semibold">Screened</th>
                  <th className="px-4 py-3 font-semibold">Valid until</th>
                </tr>
              </thead>
              <tbody>
                {screenings.map((s) => {
                  const expired = s.expires_at !== null && s.expires_at < new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{s.supplier_name}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={CONCLUSION_TONE[s.conclusion]}>
                          {CONCLUSION_LABEL[s.conclusion]}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.confirmed_event_count}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(s.screened_at).toLocaleDateString()}
                        <span className="block text-xs text-slate-500">{s.screener_name}</span>
                      </td>
                      <td className="px-4 py-3">
                        {s.expires_at
                          ? <StatusBadge tone={expired ? "danger" : "neutral"}>
                              {expired ? `Expired ${s.expires_at}` : s.expires_at}
                            </StatusBadge>
                          : <span className="text-slate-500">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {screening && (
        <ScreeningForm
          suppliers={suppliers}
          confirmedBySupplier={confirmedBySupplier}
          onClose={() => setScreening(false)}
          initialSupplierId={focusSupplierId}
        />
      )}
    </div>
  );
}
