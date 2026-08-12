"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";

interface Supplier { id: string; supplier_name: string }

interface Props {
  onClose: () => void;
}

export function StartAssessmentModal({ onClose }: Props) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/corrective-actions?list_suppliers=1")
      .then((r) => r.json())
      .then((d) => {
        setSuppliers(d.suppliers ?? []);
        if (d.suppliers?.length) setSupplierId(d.suppliers[0].id);
      })
      .catch(() => setError("Failed to load suppliers"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/readiness/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: supplierId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Assessment failed");
      }
      router.refresh();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-auto w-full max-w-md rounded-xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Start Readiness Assessment</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <p className="text-sm text-slate-500">
            Select a supplier to assess. The platform will score all of their FSVP records and calculate an overall readiness percentage.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Supplier <span className="text-red-500">*</span>
            </label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading suppliers…
              </div>
            ) : suppliers.length === 0 ? (
              <p className="text-sm text-slate-400">No linked suppliers found.</p>
            ) : (
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                required
                className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.supplier_name}</option>
                ))}
              </select>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loading || !supplierId}
              className="flex items-center gap-2 rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Calculating…" : "Run Assessment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
