"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * The exporter's answer to a corrective action: what went wrong on their side
 * and what they changed. Saved to corrective_actions.supplier_response, which
 * the importer sees on Gaps & Actions. The importer still decides the outcome.
 */
export function SupplierResponseForm({ actionId, current }: { actionId: string; current: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!current);
  const [text, setText] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/corrective-actions/${actionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ supplier_response: text }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Could not send.");
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send.");
      }
    });
  }

  if (!editing && current) {
    return (
      <div className="rounded-md border border-line bg-white p-3 text-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Your response</p>
        <p className="whitespace-pre-line text-slate-700">{current}</p>
        <button type="button" onClick={() => setEditing(true)} className="mt-2 text-xs font-semibold text-forest hover:underline">
          Edit response
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600" htmlFor={`response-${actionId}`}>
        Your response to the importer
      </label>
      <textarea
        id={`response-${actionId}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="What caused it, and what you have changed or will change."
        className="mt-1 w-full resize-y rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-forest"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={send}
          disabled={pending || !text.trim()}
          className="inline-flex h-8 items-center rounded-md bg-forest px-3 text-xs font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-50"
        >
          {pending ? "Sending…" : current ? "Update response" : "Send response"}
        </button>
        <a href="/my-evidence" className="text-xs font-semibold text-forest hover:underline">
          Upload evidence
        </a>
        {current && (
          <button type="button" onClick={() => { setText(current); setEditing(false); }} className="text-xs text-slate-500 hover:underline">
            Cancel
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
