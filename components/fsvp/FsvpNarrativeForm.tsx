"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface NarrativeSection {
  field: string;
  label: string;
  description: string;
  value: string | null;
}

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
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await fetch(`/api/fsvp-records/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <div key={section.field}>
          <label className="block text-sm font-semibold text-ink">
            {section.label}
          </label>
          <p className="mt-0.5 text-xs text-slate-500">{section.description}</p>
          {readonly ? (
            <div className="mt-2 min-h-[80px] rounded-md border border-line bg-slate-50 px-3 py-2.5 text-sm text-slate-700 whitespace-pre-wrap">
              {values[section.field] || <span className="italic text-slate-400">Not completed</span>}
            </div>
          ) : (
            <textarea
              value={values[section.field]}
              onChange={(e) => {
                setValues((prev) => ({ ...prev, [section.field]: e.target.value }));
                setSaved(false);
              }}
              rows={4}
              className="mt-2 w-full rounded-md border border-line px-3 py-2.5 text-sm text-ink placeholder-slate-400 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest resize-y"
              placeholder={`Enter ${section.label.toLowerCase()}…`}
            />
          )}
        </div>
      ))}

      {!readonly && (
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex h-10 items-center rounded-md bg-forest px-5 text-sm font-semibold text-white hover:bg-[#195f4d] disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          {saved && <StatusBadge tone="success">Saved</StatusBadge>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
