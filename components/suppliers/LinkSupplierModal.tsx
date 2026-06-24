"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Search, Link } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/types/platform";

type SupplierResult = {
  id: string;
  company_name: string;
  legal_entity_name: string | null;
  country: string;
  fda_registration_number: string | null;
  approval_status: string;
  supplier_type: string | null;
};

function approvalTone(status: string): StatusTone {
  if (status === "approved" || status === "active") return "success";
  if (status === "pending_review") return "warning";
  if (status === "suspended" || status === "rejected") return "danger";
  return "neutral";
}

export function LinkSupplierModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SupplierResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/importer-links/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setResults(data.suppliers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, []);

  async function handleLink(supplierId: string, companyName: string) {
    setLinking(supplierId);
    setError(null);
    try {
      const res = await fetch("/api/importer-links/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: supplierId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to link supplier");
      setSuccess(`${companyName} linked successfully.`);
      setResults((prev) => prev.filter((s) => s.id !== supplierId));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link supplier");
    } finally {
      setLinking(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold text-ink">Link a Supplier</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 transition">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-500">
            Search for a registered foreign supplier in the platform and link them to your importer account. Once linked, their evidence will appear in your review queue.
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.length >= 2 || e.target.value.length === 0) {
                  search(e.target.value);
                }
              }}
              onFocus={() => search(query)}
              placeholder="Search by company name…"
              className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-forest"
            />
          </div>

          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {success && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p>}

          {searching && <p className="text-sm text-slate-400">Searching…</p>}

          {!searching && results.length === 0 && query.length >= 2 && (
            <p className="text-sm text-slate-500">No unlinked suppliers found matching &ldquo;{query}&rdquo;.</p>
          )}

          {results.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Company</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Country</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {results.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-ink">{s.company_name}</p>
                        {s.legal_entity_name && (
                          <p className="text-xs text-slate-400">{s.legal_entity_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{s.country}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone={approvalTone(s.approval_status)}>
                          {s.approval_status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleLink(s.id, s.company_name)}
                          disabled={linking === s.id}
                          className="inline-flex items-center gap-1.5 h-8 rounded-md bg-forest px-3 text-xs font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-50"
                        >
                          <Link className="h-3.5 w-3.5" />
                          {linking === s.id ? "Linking…" : "Link"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
