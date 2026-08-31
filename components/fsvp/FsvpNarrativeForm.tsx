"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PenLine } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface NarrativeSection {
  field: string;
  label: string;
  description: string;
  value: string | null;
}

/**
 * The importer's own § 1.505–1.506 narrative, in the two states every other
 * recorded thing on the platform has: done, or being written.
 *
 * It used to render four textareas and a Save button permanently. Saved text
 * and unsaved keystrokes looked identical, so a completed section was
 * indistinguishable from an abandoned one, and nothing about the page said
 * which of the four still needed work.
 *
 * Closed once every section has text -- a read-only summary and an Edit
 * button, the same shape ProductFdaCodeCard uses for a recorded FDA code.
 * Open while any section is still blank, so a fresh record is not hidden
 * behind a click.
 */
export function FsvpNarrativeForm({
  recordId,
  sections,
  readonly,
}: {
  recordId: string;
  sections: NarrativeSection[];
  readonly: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(sections.map((s) => [s.field, s.value ?? ""]))
  );
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = (field: string) => (values[field] ?? "").trim().length > 0;
  const completeCount = sections.filter((s) => filled(s.field)).length;
  const complete = completeCount === sections.length;

  // Readonly records never open. Otherwise: open while anything is missing, or
  // whenever the reader has asked to edit.
  const showForm = !readonly && (editing || !complete);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/fsvp-records/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setEditing(false);
      router.refresh();
    });
  }

  function handleCancel() {
    setValues(Object.fromEntries(sections.map((s) => [s.field, s.value ?? ""])));
    setEditing(false);
    setError(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {complete ? (
          <StatusBadge tone="success">All {sections.length} sections completed</StatusBadge>
        ) : (
          <StatusBadge tone="warning">
            {completeCount} of {sections.length} sections completed
          </StatusBadge>
        )}
        {!readonly && !showForm && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <PenLine className="h-3.5 w-3.5" />
            Edit
          </button>
        )}
      </div>

      {sections.map((section) => (
        <div key={section.field}>
          <label className="block text-sm font-semibold text-ink">
            {section.label}
          </label>
          <p className="mt-0.5 text-xs text-slate-500">{section.description}</p>
          {showForm ? (
            <textarea
              value={values[section.field]}
              onChange={(e) => setValues((prev) => ({ ...prev, [section.field]: e.target.value }))}
              rows={4}
              className="mt-2 w-full rounded-md border border-line px-3 py-2.5 text-sm text-ink placeholder-slate-400 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest resize-y"
              placeholder={`Enter ${section.label.toLowerCase()}…`}
            />
          ) : (
            <div className="mt-2 min-h-[44px] rounded-md border border-line bg-slate-50 px-3 py-2.5 text-sm text-slate-700 whitespace-pre-wrap">
              {values[section.field] || <span className="italic text-slate-400">Not completed</span>}
            </div>
          )}
        </div>
      ))}

      {showForm && (
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex h-10 items-center rounded-md bg-forest px-5 text-sm font-semibold text-white hover:bg-[#195f4d] disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          {/* Only offered once there is a saved state to fall back to. */}
          {complete && (
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {!showForm && error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
