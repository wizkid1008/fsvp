"use client";

/**
 * Open "none of these fit" requests, and what an administrator does about them.
 *
 * Without this screen the request table is a place importers write into and
 * nobody reads — which would be worse than the dead end it replaced, because
 * the product page now promises somebody is dealing with it.
 *
 * Resolving points the request at a commodity. It deliberately does NOT
 * classify the product: /api/products/classify refuses anyone but the US
 * importer, because that is where FSVP puts the responsibility. The importer
 * still chooses; what changes is that there is now something correct to choose.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Inbox } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

export type ClassificationRequestQueueRow = {
  id: string;
  product_name: string;
  importer_name: string | null;
  described_as: string;
  plant_part: string | null;
  is_propagative: boolean | null;
  notes: string | null;
  /** FDA product names the server found for the description, at request time. */
  pcb_rows: Array<Record<string, string | null>>;
  pcb_searched_for: string | null;
  created_at: string;
};

export type QueueCommodityOption = {
  id: string;
  common_name: string;
  plant_part: string | null;
  is_propagative: boolean;
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
const labelClass = "block text-sm font-medium text-slate-700";
const primaryButton =
  "inline-flex h-10 items-center justify-center rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60";
const ghostButton =
  "inline-flex h-10 items-center justify-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60";

function RequestCard({
  request,
  commodities,
}: {
  request: ClassificationRequestQueueRow;
  commodities: QueueCommodityOption[];
}) {
  const router = useRouter();
  const [commodityId, setCommodityId] = useState("");
  const [note, setNote] = useState("");
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send(action: "resolve" | "decline") {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/commodities/classification-requests/${request.id}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, commodity_id: commodityId, resolution_note: note }),
        });
        const json = await res.json().catch(() => ({})) as { error?: string };
        if (!res.ok) {
          setError(json.error ?? "Could not answer the request.");
          return;
        }
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <div className="rounded-md border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{request.described_as}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {request.product_name}
            {request.importer_name ? ` · ${request.importer_name}` : ""} · raised{" "}
            {request.created_at.slice(0, 10)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {request.plant_part && (
            <StatusBadge tone="neutral">{request.plant_part.replace(/_/g, " ")}</StatusBadge>
          )}
          {/* Propagative material is regulated far more strictly than the same
              species as food, and it is part of a commodity's identity — so it
              is surfaced rather than buried in the notes. */}
          {request.is_propagative && <StatusBadge tone="warning">propagative</StatusBadge>}
        </div>
      </div>

      {request.notes && (
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{request.notes}</p>
      )}

      {request.pcb_rows.length > 0 && (
        <div className="mt-3 rounded-md bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-600">
            FDA product names matching &ldquo;{request.pcb_searched_for ?? request.described_as}&rdquo;
            at the time of the request
          </p>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-slate-700">
            {request.pcb_rows.slice(0, 12).map((row, i) => (
              <li key={i}>• {Object.values(row).filter(Boolean).join(" — ")}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            FDA&apos;s own wording for similar products. Evidence of what was looked at — not a
            proposal, and not an admissibility answer.
          </p>
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className={labelClass}>
          Commodity to use
          <select
            value={commodityId}
            onChange={(event) => setCommodityId(event.target.value)}
            className={inputClass}
          >
            <option value="">Select commodity</option>
            {commodities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.common_name}
                {c.plant_part && c.plant_part !== "not_applicable" ? ` — ${c.plant_part}` : ""}
                {c.is_propagative ? " — propagative" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => send("resolve")}
          disabled={pending || !commodityId}
          className={`${primaryButton} sm:mt-7`}
        >
          Resolve
        </button>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
        If nothing here fits, add the commodity first — resolving links the request to it. The
        importer still makes the classification; responsibility for the movement is theirs.
      </p>

      {!declining ? (
        <button
          type="button"
          onClick={() => setDeclining(true)}
          className="mt-3 text-sm font-medium text-slate-500 hover:underline"
        >
          Decline instead
        </button>
      ) : (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
          <label className={labelClass}>
            Why this is declined
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={inputClass}
              placeholder="What the importer should do instead"
            />
          </label>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-900">
            A refusal with no reason sends the importer back to guessing, which is the behaviour
            this queue exists to stop.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => send("decline")}
              disabled={pending || note.trim().length < 3}
              className={ghostButton}
            >
              Decline request
            </button>
            <button type="button" onClick={() => setDeclining(false)} className={ghostButton}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function ClassificationRequestQueue({
  requests,
  commodities,
}: {
  requests: ClassificationRequestQueueRow[];
  commodities: QueueCommodityOption[];
}) {
  return (
    <section className="mt-6 rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <Inbox className="h-4 w-4 text-slate-400" />
        <h2 className="text-base font-semibold text-ink">Classification Requests</h2>
        {requests.length > 0 && <StatusBadge tone="warning">{requests.length} open</StatusBadge>}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-slate-500">
        Raised by importers whose product no commodity describes. Each one is a product stuck at
        classification — and the alternative to answering it is somebody picking the nearest wrong
        commodity, which produces a determination that looks authoritative and answers the wrong
        question.
      </p>

      {requests.length === 0 ? (
        <p className="mt-4 rounded-md bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          Nothing waiting.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {requests.map((request) => (
            <RequestCard key={request.id} request={request} commodities={commodities} />
          ))}
        </div>
      )}
    </section>
  );
}
