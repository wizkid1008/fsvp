"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardList, Loader2, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  parseFormSchema,
  type AnswerValue,
  type FormAnswers,
  type FormField,
  type FormSchema,
} from "@/lib/forms/schema";

type LoadedForm = {
  definition: {
    id: string;
    form_key: string;
    title: string;
    description: string | null;
    schema_json: unknown;
  };
  /** Set when the caller may read the answers but not submit them (admin preview). */
  read_only?: boolean;
  response: {
    id: string;
    version: number;
    answers: FormAnswers;
    status: string;
    review_status: string | null;
    review_notes: string | null;
  } | null;
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
const areaClass =
  "mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest";

function Field({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: FormField;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  readOnly: boolean;
}) {
  const id = `field-${field.key}`;
  const label = (
    <label htmlFor={id} className="block text-sm font-medium text-slate-700">
      {field.label}
      {field.required && <span className="ml-0.5 text-red-600">*</span>}
    </label>
  );
  const help = field.help ? <p className="mt-1 text-xs text-slate-500">{field.help}</p> : null;
  const common = { id, name: field.key, disabled: readOnly };

  switch (field.type) {
    case "textarea":
      return (
        <div>
          {label}
          <textarea
            {...common}
            rows={3}
            className={areaClass}
            placeholder={field.placeholder}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {help}
        </div>
      );

    case "yes_no":
      return (
        <div>
          {label}
          <div className="mt-1.5 flex gap-2">
            {["yes", "no"].map((option) => (
              <button
                key={option}
                type="button"
                disabled={readOnly}
                onClick={() => onChange(option)}
                className={`h-9 rounded-md border px-4 text-sm font-semibold capitalize transition disabled:opacity-60 ${
                  value === option
                    ? "border-forest bg-emerald-50 text-forest"
                    : "border-line bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          {help}
        </div>
      );

    case "select":
      return (
        <div>
          {label}
          <select
            {...common}
            className={inputClass}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Choose…</option>
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {help}
        </div>
      );

    case "radio":
      return (
        <div>
          {label}
          <div className="mt-1.5 space-y-1.5">
            {(field.options ?? []).map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name={field.key}
                  disabled={readOnly}
                  checked={value === o.value}
                  onChange={() => onChange(o.value)}
                  className="h-4 w-4 border-line text-forest focus:ring-forest"
                />
                {o.label}
              </label>
            ))}
          </div>
          {help}
        </div>
      );

    case "checkbox":
      return (
        <div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              {...common}
              type="checkbox"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line text-forest focus:ring-forest"
            />
            <span>
              {field.label}
              {field.required && <span className="ml-0.5 text-red-600">*</span>}
            </span>
          </label>
          {help}
        </div>
      );

    case "number":
      return (
        <div>
          {label}
          <input
            {...common}
            type="number"
            className={inputClass}
            value={value === undefined || value === null ? "" : String(value)}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          />
          {help}
        </div>
      );

    default:
      return (
        <div>
          {label}
          <input
            {...common}
            type={field.type === "email" ? "email" : field.type === "date" ? "date" : field.type === "phone" ? "tel" : "text"}
            className={inputClass}
            placeholder={field.placeholder}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
          {help}
        </div>
      );
  }
}

/**
 * Fills in a form-backed requirement item.
 *
 * `preview` renders a definition without loading or saving anything — used by
 * the admin form editor so an author can see what they are writing.
 */
export function FormFillPanel({
  requirementItemId,
  supplierId,
  onClose,
  preview,
}: {
  requirementItemId?: string;
  supplierId?: string;
  onClose?: () => void;
  preview?: { schema: FormSchema; title: string; description?: string | null };
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<LoadedForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<FormAnswers>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (preview || !requirementItemId) return;
    let cancelled = false;

    (async () => {
      try {
        const qs = supplierId ? `?supplier_id=${encodeURIComponent(supplierId)}` : "";
        const res = await fetch(`/api/forms/definitions/${requirementItemId}${qs}`);
        const json = await res.json() as LoadedForm & { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Could not load the form.");
        if (cancelled) return;
        setLoaded(json);
        setAnswers(json.response?.answers ?? {});
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load the form.");
      }
    })();

    return () => { cancelled = true; };
  }, [requirementItemId, supplierId, preview]);

  const schema: FormSchema | null = useMemo(() => {
    if (preview) return preview.schema;
    if (!loaded) return null;
    const parsed = parseFormSchema(loaded.definition.schema_json);
    return parsed.ok ? parsed.schema : null;
  }, [loaded, preview]);

  function setAnswer(key: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function save(submit: boolean) {
    if (!loaded) return;
    setErrors([]);
    startTransition(async () => {
      try {
        const res = await fetch("/api/forms/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            form_definition_id: loaded.definition.id,
            supplier_id: supplierId,
            answers,
            submit,
          }),
        });
        const json = await res.json() as { error?: string; reasons?: string[] };
        if (!res.ok || json.error) {
          setErrors(json.reasons?.length ? json.reasons : [json.error ?? "Could not save."]);
          return;
        }
        if (submit) {
          router.refresh();
          onClose?.();
        } else {
          setSaved(true);
        }
      } catch (err) {
        setErrors([err instanceof Error ? err.message : "Something went wrong."]);
      }
    });
  }

  const title = preview?.title ?? loaded?.definition.title ?? "Loading…";
  const description = preview?.description ?? loaded?.definition.description;
  const readOnly = Boolean(preview) || Boolean(loaded?.read_only);
  const review = loaded?.response;

  const bodyContent = () => {
    if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
    if (!schema) {
      return (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the form…
        </p>
      );
    }

    return (
      <>
        {loaded?.read_only && (
          <div className="rounded-md border border-line bg-slate-50 px-3 py-2">
            <p className="text-sm text-slate-600">
              You are viewing this as an administrator. The answers are read-only — only the
              supplier, or the importer acting for them, can submit this form.
            </p>
          </div>
        )}

        {review?.review_status === "needs_revision" || review?.review_status === "rejected" ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-semibold text-amber-900">
              Your last submission was {review.review_status === "rejected" ? "rejected" : "sent back for revision"}
            </p>
            {review.review_notes && (
              <p className="mt-1 text-sm text-amber-900">{review.review_notes}</p>
            )}
            <p className="mt-1 text-xs text-amber-800">
              Your previous answers are below. Change what needs changing and submit again.
            </p>
          </div>
        ) : review?.review_status === "accepted" ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-sm text-emerald-900">
              Version {review.version} was accepted. Submitting again replaces it with a new version.
            </p>
          </div>
        ) : review?.status === "submitted" ? (
          <div className="rounded-md border border-line bg-slate-50 px-3 py-2">
            <p className="text-sm text-slate-600">
              Version {review.version} is with your importer for review.
            </p>
          </div>
        ) : null}

        {schema.sections.map((section) => (
          <section key={section.key} className="space-y-4">
            <div className="border-b border-line pb-2">
              <h3 className="text-sm font-semibold text-ink">{section.title}</h3>
              {section.description && (
                <p className="mt-0.5 text-xs text-slate-500">{section.description}</p>
              )}
            </div>
            {section.fields.map((field) => (
              <Field
                key={field.key}
                field={field}
                value={answers[field.key]}
                onChange={(v) => setAnswer(field.key, v)}
                readOnly={readOnly}
              />
            ))}
          </section>
        ))}

        {errors.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <p className="text-sm font-semibold text-red-900">Not submitted</p>
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-8 text-sm text-red-900">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            {saved && <span className="mr-auto text-xs text-slate-500">Draft saved.</span>}
            <button
              type="button"
              onClick={() => save(false)}
              disabled={pending}
              className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={pending}
              className="inline-flex h-10 items-center rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:opacity-60"
            >
              {pending ? "Working…" : "Submit"}
            </button>
          </div>
        )}
      </>
    );
  };

  // Preview renders inline; the real thing is a modal over the checklist.
  if (preview) {
    return <div className="space-y-6">{bodyContent()}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-line bg-white shadow-xl">
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-line bg-white px-6 py-4">
          <div className="flex items-start gap-2">
            <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
            <div>
              <h2 className="text-lg font-semibold text-ink">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {review?.review_status && (
              <StatusBadge tone={review.review_status === "accepted" ? "success" : "warning"}>
                {review.review_status.replace(/_/g, " ")}
              </StatusBadge>
            )}
            <button onClick={onClose} className="rounded p-1 transition hover:bg-slate-100">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </div>
        <div className="space-y-6 px-6 py-5">{bodyContent()}</div>
      </div>
    </div>
  );
}
