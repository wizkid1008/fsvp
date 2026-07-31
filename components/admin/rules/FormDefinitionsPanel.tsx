"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Eye, EyeOff } from "lucide-react";
import { FormFillPanel } from "@/components/forms/FormFillPanel";
import { parseFormSchema, type FormSchema } from "@/lib/forms/schema";

export type FormDefinitionRow = {
  id: string;
  requirement_item_id: string;
  form_key: string;
  title: string;
  description: string | null;
  schema_json: unknown;
};

export type FormItemOption = {
  id: string;
  item_name: string;
  item_key: string;
  evidence_type: string | null;
};

const STARTER = JSON.stringify(
  {
    sections: [
      {
        key: "section_one",
        title: "Section One",
        fields: [
          { key: "example_question", type: "yes_no", label: "An example question", required: true, flag_answer: "no" },
        ],
      },
    ],
  },
  null,
  2
);

/**
 * Authoring for the forms that back a requirement item.
 *
 * A validated JSON editor with a live preview rather than a drag-and-drop
 * builder: the surrounding admin rules screens are plain tables, a builder is a
 * much larger piece of work, and parseFormSchema already gives precise errors
 * ("Section 2, field 3: unknown type 'txt'").
 */
export function FormDefinitionsPanel({
  ruleVersionId,
  isDraft,
  items,
  forms,
}: {
  ruleVersionId: string;
  isDraft: boolean;
  items: FormItemOption[];
  forms: FormDefinitionRow[];
}) {
  const router = useRouter();
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [draftJson, setDraftJson] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(true);
  const [pending, startTransition] = useTransition();

  const formByItem = new Map(forms.map((f) => [f.requirement_item_id, f]));

  function startEditing(item: FormItemOption) {
    const existing = formByItem.get(item.id);
    setEditingItemId(item.id);
    setErrors([]);
    setTitle(existing?.title ?? item.item_name);
    setDescription(existing?.description ?? "");
    setDraftJson(existing ? JSON.stringify(existing.schema_json, null, 2) : STARTER);
  }

  const parsed = draftJson ? parseFormSchema(draftJson) : null;
  const previewSchema: FormSchema | null = parsed && parsed.ok ? parsed.schema : null;

  function save(item: FormItemOption) {
    const existing = formByItem.get(item.id);
    const check = parseFormSchema(draftJson);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors([]);

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/forms", {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            existing
              ? { id: existing.id, title, description, schema_json: check.schema }
              : {
                  requirement_item_id: item.id,
                  rule_version_id: ruleVersionId,
                  form_key: item.item_key,
                  title,
                  description,
                  schema_json: check.schema,
                }
          ),
        });
        const json = await res.json() as { error?: string; reasons?: string[] };
        if (!res.ok || json.error) {
          setErrors(json.reasons?.length ? json.reasons : [json.error ?? "Could not save."]);
          return;
        }
        setEditingItemId(null);
        router.refresh();
      } catch (err) {
        setErrors([err instanceof Error ? err.message : "Something went wrong."]);
      }
    });
  }

  if (items.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        No requirement items in this version yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        A form turns a requirement item from &ldquo;upload a document&rdquo; into questions answered
        in the app. Submitting one produces a document behind the scenes, so scoring, the review
        queue and the inspection package treat it like any other evidence.
      </p>

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Requirement item</th>
              <th className="px-4 py-3 font-semibold">Collected as</th>
              <th className="px-4 py-3 font-semibold">Form</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const existing = formByItem.get(item.id);
              return (
                <tr key={item.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{item.item_name}</p>
                    <p className="text-xs text-slate-500">{item.item_key}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.evidence_type === "form" ? "Form" : item.evidence_type ?? "Document"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {existing
                      ? <span className="inline-flex items-center gap-1.5 text-forest">
                          <ClipboardList className="h-3.5 w-3.5" /> {existing.title}
                        </span>
                      : <span className="text-slate-400">None</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => (editingItemId === item.id ? setEditingItemId(null) : startEditing(item))}
                      disabled={!isDraft && !existing}
                      title={!isDraft ? "Published versions are read-only. Clone into a draft to change a form." : undefined}
                      className="text-xs font-semibold text-forest hover:underline disabled:text-slate-300 disabled:no-underline"
                    >
                      {editingItemId === item.id ? "Close" : existing ? (isDraft ? "Edit" : "View") : "Add a form"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingItemId && (() => {
        const item = items.find((i) => i.id === editingItemId);
        if (!item) return null;

        return (
          <div className="rounded-lg border border-line bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">{item.item_name}</h3>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-forest"
              >
                {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showPreview ? "Hide preview" : "Show preview"}
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700" htmlFor="form-title">Title</label>
                  <input
                    id="form-title"
                    value={title}
                    disabled={!isDraft}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700" htmlFor="form-desc">Description</label>
                  <input
                    id="form-desc"
                    value={description}
                    disabled={!isDraft}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700" htmlFor="form-json">
                    Questions (JSON)
                  </label>
                  <textarea
                    id="form-json"
                    value={draftJson}
                    disabled={!isDraft}
                    onChange={(e) => { setDraftJson(e.target.value); setErrors([]); }}
                    rows={20}
                    spellCheck={false}
                    className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-xs outline-none focus:border-forest disabled:bg-slate-50"
                  />
                </div>

                {parsed && !parsed.ok && (
                  <ul className="list-disc space-y-0.5 rounded-md border border-amber-200 bg-amber-50 py-2 pl-8 pr-3 text-xs text-amber-900">
                    {parsed.errors.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                )}
                {errors.length > 0 && (
                  <ul className="list-disc space-y-0.5 rounded-md border border-red-200 bg-red-50 py-2 pl-8 pr-3 text-xs text-red-900">
                    {errors.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                )}

                {isDraft && (
                  <button
                    type="button"
                    onClick={() => save(item)}
                    disabled={pending || !parsed?.ok}
                    className="inline-flex h-9 items-center rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60"
                  >
                    {pending ? "Saving…" : formByItem.has(item.id) ? "Save form" : "Create form"}
                  </button>
                )}
              </div>

              {showPreview && (
                <div className="rounded-md border border-line bg-slate-50 p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
                  {previewSchema ? (
                    <FormFillPanel preview={{ schema: previewSchema, title, description }} />
                  ) : (
                    <p className="text-xs text-slate-500">Fix the errors to see a preview.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
