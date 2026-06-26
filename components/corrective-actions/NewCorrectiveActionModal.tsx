"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

interface Supplier { id: string; supplier_name: string }

interface Props {
  onClose: () => void;
}

export function NewCorrectiveActionModal({ onClose }: Props) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [triggeredBy, setTriggeredBy] = useState("other");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/corrective-actions?list_suppliers=1")
      .then((r) => r.json())
      .then((d) => {
        setSuppliers(d.suppliers ?? []);
        if (d.suppliers?.length) setSupplierId(d.suppliers[0].id);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId || !issueDescription.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/corrective-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: supplierId, issue_description: issueDescription, triggered_by: triggeredBy }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to create corrective action");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">New Corrective Action</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Supplier <span className="text-red-500">*</span></label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
            >
              {suppliers.length === 0 && <option value="">Loading…</option>}
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.supplier_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Source <span className="text-red-500">*</span></label>
            <select
              value={triggeredBy}
              onChange={(e) => setTriggeredBy(e.target.value)}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
            >
              <option value="verification_finding">Verification Finding</option>
              <option value="reassessment">Reassessment</option>
              <option value="recall">Recall</option>
              <option value="consumer_complaint">Consumer Complaint</option>
              <option value="inspector_finding">Inspector Finding</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Issue Description <span className="text-red-500">*</span></label>
            <textarea
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              placeholder="Describe the issue that requires corrective action…"
              rows={4}
              required
              className="w-full resize-y rounded-lg border border-line px-3 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-forest focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !supplierId || !issueDescription.trim()}
              className="rounded-lg bg-forest px-4 py-2 text-sm font-semibold text-white hover:bg-forest/90 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create Action"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
