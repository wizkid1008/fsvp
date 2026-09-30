"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ClipboardList, FileSignature, ShieldOff, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ASSURANCE_CATEGORIES, assuranceSpec } from "@/lib/fsvp/assurances";
import type { StatusTone } from "@/types/platform";

export type GateBlockView = { code: string; message: string };

export type VerificationDeterminationView = {
  id: string;
  activities: string[];
  frequency_notes: string;
  sahcodha_hazard_present: boolean;
  controlled_by_foreign_supplier: boolean;
  annual_onsite_audit_performed: boolean;
  alternative_justification: string | null;
  determined_at: string;
} | null;

export type AssuranceView = {
  id: string;
  category: string;
  citation: string;
  counterparty_name: string | null;
  food_scope: string;
  expires_at: string;
};

const btnClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:opacity-60";
const ghostBtn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-line bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60";
const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
const areaClass =
  "mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest";
const labelClass = "block text-sm font-medium text-slate-700";

const ACTIVITIES = [
  { key: "onsite_audit",              label: "Onsite audit" },
  { key: "sampling_testing",          label: "Sampling and testing" },
  { key: "records_review",            label: "Review of food safety records" },
  { key: "other_appropriate_activity", label: "Other appropriate activity" },
];

/**
 * Unsaved form drafts, kept in this browser per record and form.
 *
 * Both forms are long, and closing the dialog — or a refusal that sends the
 * reader off to fix something else first — used to throw away everything
 * typed. A draft is cleared once the server accepts the form. Storage can be
 * unavailable (private windows, blocked site data), so every access is
 * guarded and the forms work the same without it.
 */
type Draft = Record<string, unknown>;

function readDraft(key: string): Draft {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDraft(key: string, draft: Draft) {
  try { window.localStorage.setItem(key, JSON.stringify(draft)); } catch { /* storage unavailable */ }
}

function clearDraft(key: string) {
  try { window.localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

function hasContent(draft: Draft): boolean {
  return Object.values(draft).some((v) =>
    Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : v === true
  );
}

const text = (draft: Draft, field: string) => (typeof draft[field] === "string" ? (draft[field] as string) : "");

function DraftNotice({ onDiscard }: { onDiscard: () => void }) {
  return (
    <p className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
      Restored your unsaved draft.
      <button type="button" onClick={onDiscard} className="font-medium text-forest hover:underline">
        Discard it
      </button>
    </p>
  );
}

function Modal({
  title, icon: Icon, onClose, children,
}: {
  title: string; icon: React.ElementType; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-white shadow-xl">
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
 * The § 1.506(d) determination.
 *
 * Each factor gets its own field rather than one free-text box, because
 * § 1.506(d)(1)(i) asks the importer to consider specific things and a
 * paragraph that mentions none of them cannot be told from one that does.
 */
function VerificationForm({ recordId, onClose }: { recordId: string; onClose: () => void }) {
  const router = useRouter();
  const draftKey = `fsvp-draft:verification:${recordId}`;
  const [draft, setDraft] = useState<Draft>(() => readDraft(draftKey));
  const [restored, setRestored] = useState(() => hasContent(draft));
  const [formKey, setFormKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const [activities, setActivities] = useState<string[]>(() =>
    Array.isArray(draft.activities) ? (draft.activities as string[]) : []
  );
  const [sahcodha, setSahcodha] = useState(draft.sahcodha === true);
  const [bySupplier, setBySupplier] = useState(draft.bySupplier === true);
  const [audited, setAudited] = useState(draft.audited === true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function persist() {
    if (!formRef.current) return;
    writeDraft(draftKey, {
      ...Object.fromEntries(new FormData(formRef.current)),
      activities, sahcodha, bySupplier, audited,
    });
  }
  // The checkboxes are state, so they are saved once their new value lands.
  useEffect(persist, [activities, sahcodha, bySupplier, audited]); // eslint-disable-line react-hooks/exhaustive-deps

  function discard() {
    clearDraft(draftKey);
    setDraft({});
    setActivities([]);
    setSahcodha(false);
    setBySupplier(false);
    setAudited(false);
    setRestored(false);
    setFormKey((k) => k + 1);
  }

  // Mirrors the § 1.506(d)(2) rule the server and the database both enforce.
  // Shown here so the requirement is visible while deciding, not after saving.
  const needsJustification = sahcodha && bySupplier && !audited;

  function toggle(key: string) {
    setActivities((prev) => (prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const res = await fetch("/api/fsvp/verification-determinations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fsvp_record_id: recordId,
            activities,
            frequency_notes:              fd.get("frequency_notes")?.toString().trim() ?? "",
            hazard_analysis_basis:        fd.get("hazard_analysis_basis")?.toString().trim() ?? "",
            supplier_performance_basis:   fd.get("supplier_performance_basis")?.toString().trim() ?? "",
            food_and_supplier_risk_basis: fd.get("food_and_supplier_risk_basis")?.toString().trim() ?? "",
            storage_and_transport_basis:  fd.get("storage_and_transport_basis")?.toString().trim() || undefined,
            sahcodha_hazard_present:        sahcodha,
            controlled_by_foreign_supplier: bySupplier,
            annual_onsite_audit_performed:  audited,
            alternative_justification:      fd.get("alternative_justification")?.toString().trim() || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "Could not record the determination.");
          return;
        }
        clearDraft(draftKey);
        onClose();
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <Modal title="Determine verification activities" icon={ClipboardList} onClose={onClose}>
      <p className="mb-4 text-sm leading-relaxed text-slate-600">
        § 1.506(d)(1)(i) requires you to determine and document which supplier verification
        activities are appropriate, and why, considering the § 1.505 evaluation.
      </p>

      {restored && <DraftNotice onDiscard={discard} />}

      <form key={formKey} ref={formRef} onSubmit={submit} onChange={persist} className="space-y-4">
        <fieldset>
          <legend className={labelClass}>Activities</legend>
          <div className="mt-2 space-y-1.5">
            {ACTIVITIES.map((a) => (
              <label key={a.key} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={activities.includes(a.key)}
                  onChange={() => toggle(a.key)}
                  className="h-4 w-4 rounded border-line"
                />
                {a.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className={labelClass} htmlFor="frequency_notes">Frequency</label>
          <textarea id="frequency_notes" name="frequency_notes" defaultValue={text(draft, "frequency_notes")} rows={2} required className={areaClass}
            placeholder="How often each activity will be performed, and why that frequency." />
        </div>

        <div>
          <label className={labelClass} htmlFor="hazard_analysis_basis">What the hazard analysis found</label>
          <textarea id="hazard_analysis_basis" name="hazard_analysis_basis" defaultValue={text(draft, "hazard_analysis_basis")} rows={2} required className={areaClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="supplier_performance_basis">Supplier performance history</label>
          <textarea id="supplier_performance_basis" name="supplier_performance_basis" defaultValue={text(draft, "supplier_performance_basis")} rows={2} required className={areaClass}
            placeholder="Compliance history, previous verification results, corrective actions." />
        </div>

        <div>
          <label className={labelClass} htmlFor="food_and_supplier_risk_basis">Risk posed by the food and the supplier</label>
          <textarea id="food_and_supplier_risk_basis" name="food_and_supplier_risk_basis" defaultValue={text(draft, "food_and_supplier_risk_basis")} rows={2} required className={areaClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="storage_and_transport_basis">
            Storage and transport <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea id="storage_and_transport_basis" name="storage_and_transport_basis" defaultValue={text(draft, "storage_and_transport_basis")} rows={2} className={areaClass} />
        </div>

        <div className="rounded-md border border-line bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-700">§ 1.506(d)(2) — serious hazards</p>
          <div className="mt-2 space-y-1.5">
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={sahcodha} onChange={(e) => setSahcodha(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-line" />
              <span>
                A hazard here has a reasonable probability of serious adverse health consequences or
                death (SAHCODHA).
              </span>
            </label>
            {sahcodha && (
              <label className="flex items-start gap-2 pl-6 text-sm text-slate-700">
                <input type="checkbox" checked={bySupplier} onChange={(e) => setBySupplier(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-line" />
                <span>That hazard is controlled by the foreign supplier.</span>
              </label>
            )}
            {sahcodha && bySupplier && (
              <label className="flex items-start gap-2 pl-6 text-sm text-slate-700">
                <input type="checkbox" checked={audited} onChange={(e) => setAudited(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-line" />
                <span>An onsite audit has been performed within the last year.</span>
              </label>
            )}
          </div>

          {needsJustification && (
            <div className="mt-3">
              <p className="rounded-md bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900">
                § 1.506(d)(2) requires an onsite audit before first import and at least annually in
                this case, unless you record an adequate written determination that other activities
                are appropriate. Without one this cannot be saved.
              </p>
              <label className={labelClass + " mt-2"} htmlFor="alternative_justification">
                Written determination that other activities are appropriate
              </label>
              <textarea id="alternative_justification" name="alternative_justification" defaultValue={text(draft, "alternative_justification")} rows={3} required className={areaClass} />
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={pending || activities.length === 0} className={btnClass}>
          {pending ? "Recording…" : "Record determination"}
        </button>
      </form>
    </Modal>
  );
}

function AssuranceForm({ recordId, onClose }: { recordId: string; onClose: () => void }) {
  const router = useRouter();
  const draftKey = `fsvp-draft:assurance:${recordId}`;
  const [draft, setDraft] = useState<Draft>(() => readDraft(draftKey));
  // The basis is preselected, so it alone does not make a draft worth restoring.
  const [restored, setRestored] = useState(() => hasContent({ ...draft, category: undefined }));
  const [formKey, setFormKey] = useState(0);
  const [category, setCategory] = useState(() => {
    const saved = ASSURANCE_CATEGORIES.find((a) => a.category === draft.category);
    return (saved ?? ASSURANCE_CATEGORIES[0]).category;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function persist(e: React.FormEvent<HTMLFormElement>) {
    writeDraft(draftKey, Object.fromEntries(new FormData(e.currentTarget)));
  }

  function discard() {
    clearDraft(draftKey);
    setDraft({});
    setCategory(ASSURANCE_CATEGORIES[0].category);
    setRestored(false);
    setFormKey((k) => k + 1);
  }

  const spec = assuranceSpec(category);
  const relies = spec?.needsCounterparty === true;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const res = await fetch("/api/assurances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fsvp_record_id: recordId,
            category,
            counterparty_name:  fd.get("counterparty_name")?.toString().trim() || undefined,
            counterparty_role:  fd.get("counterparty_role")?.toString().trim() || undefined,
            signatory_name:     fd.get("signatory_name")?.toString().trim() || undefined,
            signatory_title:    fd.get("signatory_title")?.toString().trim() || undefined,
            food_scope:         fd.get("food_scope")?.toString().trim() ?? "",
            hazard_description: fd.get("hazard_description")?.toString().trim() || undefined,
            assurance_text:     fd.get("assurance_text")?.toString().trim() ?? "",
            expires_at:         fd.get("expires_at")?.toString() || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "Could not record the assurance.");
          return;
        }
        clearDraft(draftKey);
        onClose();
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <Modal title="Record a written assurance" icon={FileSignature} onClose={onClose}>
      {restored && <DraftNotice onDiscard={discard} />}

      <form key={formKey} onSubmit={submit} onChange={persist} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="category">Basis</label>
          <select id="category" name="category" value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className={inputClass}>
            {ASSURANCE_CATEGORIES.map((a) => (
              <option key={a.category} value={a.category}>{a.label}</option>
            ))}
          </select>
          {spec && (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              <span className="font-medium text-slate-600">{spec.citation}</span> — {spec.description}
            </p>
          )}
        </div>

        {spec && (
          <p className="rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            <span className="font-medium">What it must state:</span> {spec.requiredStatement}
          </p>
        )}

        {relies && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="counterparty_name">Party giving the assurance</label>
              <input id="counterparty_name" name="counterparty_name" defaultValue={text(draft, "counterparty_name")} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="counterparty_role">Their role</label>
              <input id="counterparty_role" name="counterparty_role" defaultValue={text(draft, "counterparty_role")} className={inputClass} placeholder="Customer, processor…" />
            </div>
            <div>
              <label className={labelClass} htmlFor="signatory_name">Authorised official</label>
              <input id="signatory_name" name="signatory_name" defaultValue={text(draft, "signatory_name")} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="signatory_title">Their title</label>
              <input id="signatory_title" name="signatory_title" defaultValue={text(draft, "signatory_title")} className={inputClass} />
            </div>
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor="food_scope">Food covered</label>
          <input id="food_scope" name="food_scope" defaultValue={text(draft, "food_scope")} required className={inputClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="hazard_description">
            Hazard being controlled <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input id="hazard_description" name="hazard_description" defaultValue={text(draft, "hazard_description")} className={inputClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="assurance_text">What the assurance says</label>
          <textarea id="assurance_text" name="assurance_text" defaultValue={text(draft, "assurance_text")} rows={3} required className={areaClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor="expires_at">
            Valid until{" "}
            <span className="font-normal text-slate-500">
              (defaults to one year — § 1.507 requires annual renewal)
            </span>
          </label>
          <input id="expires_at" name="expires_at" defaultValue={text(draft, "expires_at")} type="date" className={inputClass} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={pending} className={btnClass}>
          {pending ? "Recording…" : "Record assurance"}
        </button>
      </form>
    </Modal>
  );
}

export function ComplianceControlsPanel({
  recordId, blocks, determination, assurances, canEdit, viewerIsActiveQi,
}: {
  recordId: string;
  blocks: GateBlockView[];
  determination: VerificationDeterminationView;
  assurances: AssuranceView[];
  canEdit: boolean;
  viewerIsActiveQi: boolean;
}) {
  const [openForm, setOpenForm] = useState<"verification" | "assurance" | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="mb-5 border-b border-line pb-4">
        <h2 className="text-base font-semibold text-ink">Verification and Assurances</h2>
        <p className="mt-1 text-sm text-slate-500">
          Which supplier verification activities are appropriate and why (§ 1.506(d)), and any
          written assurance this record relies on (§ 1.507).
        </p>
      </div>

      {blocks.length > 0 && (
        <div className="mb-5 space-y-2">
          {blocks.map((b) => (
            <p key={b.code} className="flex gap-2 rounded-md bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{b.message}</span>
            </p>
          ))}
        </div>
      )}

      {/* ── § 1.506(d) ─────────────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Verification activities determination</h3>
          {canEdit && viewerIsActiveQi && (
            <button onClick={() => setOpenForm("verification")} className={ghostBtn}>
              {determination ? "Supersede" : "Determine"}
            </button>
          )}
        </div>

        {determination ? (
          <div className="mt-2 rounded-md border border-line bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {determination.activities.map((a) => (
                <StatusBadge key={a} tone="info">{a.replace(/_/g, " ")}</StatusBadge>
              ))}
              {determination.sahcodha_hazard_present && (
                <StatusBadge tone="danger">SAHCODHA hazard</StatusBadge>
              )}
            </div>
            <p className="mt-2 text-slate-600">{determination.frequency_notes}</p>
            {determination.sahcodha_hazard_present && determination.controlled_by_foreign_supplier && (
              <p className="mt-2 text-xs text-slate-600">
                {determination.annual_onsite_audit_performed
                  ? "Annual onsite audit performed, as § 1.506(d)(2) requires."
                  : `Audit replaced by written determination: ${determination.alternative_justification}`}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Determined {new Date(determination.determined_at).toLocaleDateString()}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            No determination recorded. § 1.506(d)(1)(i) requires one before this record can be approved.
          </p>
        )}
      </div>

      {/* ── § 1.507 ────────────────────────────────────────────────────── */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Written assurances</h3>
          {canEdit && (
            <button onClick={() => setOpenForm("assurance")} className={ghostBtn}>Record</button>
          )}
        </div>

        {assurances.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            None recorded. Only needed where a hazard requiring a control is not controlled before
            the food reaches the United States.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {assurances.map((a) => {
              const expired = a.expires_at < today;
              const spec = assuranceSpec(a.category);
              return (
                <li key={a.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">{spec?.label ?? a.category}</span>
                    <StatusBadge tone={(expired ? "danger" : "success") as StatusTone}>
                      {expired ? `Expired ${a.expires_at}` : `Valid to ${a.expires_at}`}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {a.citation}
                    {a.counterparty_name ? ` · ${a.counterparty_name}` : ""} · {a.food_scope}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {openForm === "verification" && (
        <VerificationForm recordId={recordId} onClose={() => setOpenForm(null)} />
      )}
      {openForm === "assurance" && (
        <AssuranceForm recordId={recordId} onClose={() => setOpenForm(null)} />
      )}
    </section>
  );
}

/** Shown on the supplier list and record header when a supplier is suspended. */
export function SuspensionBanner({ reason, basis }: { reason: string; basis: string }) {
  return (
    <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <ShieldOff className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">
          This supplier is suspended ({basis.replace(/_/g, " ")})
        </p>
        <p className="mt-0.5 leading-relaxed">{reason}</p>
        <p className="mt-1 text-xs">
          No FSVP record for this supplier can be approved until the suspension is lifted.
        </p>
      </div>
    </div>
  );
}
