"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { parseReviewPrompts, resolveReviewPrompt } from "@/lib/fsvp/procedure-draft";

/**
 * Editing an FSVP procedure in place, rather than downloading and re-uploading.
 *
 * The download-edit-reupload loop is how a written procedure goes stale, and a
 * stale § 1.506(b) procedure is worse than none: FSVP requires you to FOLLOW
 * what you wrote, so a document describing a process you no longer use makes
 * you non-compliant with your own statement. Kept editable here, the procedure
 * is always the current one, and adopting it captures the § 1.510(a)(2)
 * signature — who and when — without asking anyone to remember.
 */
export function ProcedureEditor({
  kind,
  content,
  status,
  version,
  adoptedAt,
  adoptedBy,
}: {
  kind: string;
  content: string | null;
  status: "draft" | "adopted" | "none";
  version: number | null;
  adoptedAt: string | null;
  adoptedBy: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(content ?? "");
  const [dirty, setDirty] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const prompts = parseReviewPrompts(text);
  const unresolved = prompts.length > 0;

  /** Answering a prompt edits the document, so it leaves the same unsaved
   *  state as typing in the textarea would. */
  function answer(marker: string, written: string) {
    setText((current) => resolveReviewPrompt(current, marker, written));
    setAnswers((current) => {
      const next = { ...current };
      delete next[marker];
      return next;
    });
    setDirty(true);
    setMessage(null);
  }

  async function post(action: "generate" | "save" | "adopt", body?: string) {
    const res = await fetch("/api/importer-procedures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, action, content: action === "save" ? body : undefined }),
    });
    const json = (await res.json()) as { error?: string; content?: string };
    if (!res.ok || json.error) throw new Error(json.error ?? "That did not work.");
    return json;
  }

  function call(action: "generate" | "save" | "adopt") {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        if (action === "generate") {
          const json = await post("generate");
          if (json.content) {
            setText(json.content);
            setAnswers({});
            setDirty(false);
            setMessage("Draft rebuilt from your current configuration.");
          }
        }

        if (action === "save") {
          await post("save", text);
          setDirty(false);
          setMessage("Saved.");
        }

        // Adopting an edited draft saves it first. The alternative — refusing
        // until you press Save — makes the finished button the dead one at the
        // exact moment the work is done.
        if (action === "adopt") {
          if (dirty) {
            await post("save", text);
            setDirty(false);
          }
          await post("adopt");
          setMessage("Adopted.");
        }

        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "That did not work.");
      }
    });
  }

  if (status === "none" && !text) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => call("generate")}
          disabled={pending}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60"
        >
          <FileText className="h-3.5 w-3.5" />
          {pending ? "Drafting…" : "Draft this from our configuration"}
        </button>
        <span className="text-xs leading-5 text-slate-500">
          Builds a first version from what this platform already enforces. You edit it here — nothing
          is filed until you adopt it.
        </span>
        {error && <p className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">
          {status === "adopted"
            ? `Adopted${adoptedAt ? ` ${new Date(adoptedAt).toLocaleDateString()}` : ""}${adoptedBy ? ` by ${adoptedBy}` : ""}${version ? ` · version ${version}` : ""}`
            : `Draft${version ? ` · version ${version}` : ""} — not yet adopted`}
        </p>
        {dirty && (
          <span className="text-xs font-semibold text-amber-700">
            {status === "adopted" ? "Unsaved changes — these open a new draft" : "Unsaved changes"}
          </span>
        )}
      </div>

      <textarea
        value={text}
        onChange={(event) => { setText(event.target.value); setDirty(true); }}
        rows={16}
        spellCheck
        aria-label="Procedure text"
        className="w-full rounded-md border border-line bg-white px-3 py-2 font-mono text-[13px] leading-6 text-ink outline-none focus:border-forest"
      />

      {unresolved && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            {prompts.length === 1
              ? "One passage needs your answer before this can be adopted"
              : `${prompts.length} passages need your answer before this can be adopted`}
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            These mark what the platform cannot know about your operation. Answer each one here and
            the wording goes into the document in place of the marker — or strike the passage out if
            it does not apply to you.
          </p>

          <ul className="mt-3 space-y-3">
            {prompts.map((prompt) => (
              <li key={prompt.marker} className="rounded-md border border-amber-200 bg-white px-3 py-3">
                {prompt.section && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    {prompt.section}
                  </p>
                )}
                <p className="mt-1 text-sm leading-6 text-slate-700">{prompt.prompt}</p>

                <textarea
                  value={answers[prompt.marker] ?? ""}
                  onChange={(event) =>
                    setAnswers((current) => ({ ...current, [prompt.marker]: event.target.value }))
                  }
                  rows={3}
                  spellCheck
                  placeholder="Write what your organization actually does…"
                  aria-label={`Answer for ${prompt.section ?? "this passage"}`}
                  className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-forest"
                />

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => answer(prompt.marker, answers[prompt.marker] ?? "")}
                    disabled={pending || !(answers[prompt.marker] ?? "").trim()}
                    className="inline-flex h-8 items-center rounded-md bg-forest px-3 text-xs font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-50"
                  >
                    Put this in the document
                  </button>
                  <button
                    type="button"
                    onClick={() => answer(prompt.marker, "")}
                    disabled={pending}
                    title="Removes the passage entirely, leaving the document silent on it"
                    className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-forest hover:text-forest disabled:opacity-50"
                  >
                    Does not apply to us
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => call("save")}
          disabled={pending || !dirty}
          title={dirty ? "Save your edits to this draft" : "Nothing has changed since this draft was last saved"}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-forest hover:text-forest disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          Save draft
        </button>

        <button
          type="button"
          onClick={() => call("adopt")}
          disabled={pending || unresolved || (status === "adopted" && !dirty)}
          title={
            unresolved ? "Answer the passages marked for review first"
            : status === "adopted" && !dirty ? "This version is already adopted"
            : dirty ? "Saves your edits and adopts them as your organization's procedure"
            : "Adopt this as your organization's procedure"
          }
          className="inline-flex h-9 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-50"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Adopt this version
        </button>

        <button
          type="button"
          onClick={() => call("generate")}
          disabled={pending}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-forest hover:text-forest disabled:opacity-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Rebuild draft
        </button>
      </div>

      <p className="mt-2 text-xs leading-5 text-slate-500">
        {status === "adopted"
          ? "This procedure is in force. Editing it starts a new draft; the adopted version stays as it is until you adopt the new one."
          : "Adopting records who adopted it and when — that is the signature § 1.510(a)(2) requires. A previously adopted version is superseded, never deleted, so it stays possible to say which procedure was in force when a given approval was made."}
      </p>

      {message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
