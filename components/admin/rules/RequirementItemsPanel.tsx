"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ShieldAlert } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface RequirementItem {
  id: string;
  item_key: string;
  item_name: string;
  description: string | null;
  evidence_type: string | null;
  is_required: boolean;
  is_critical_blocker: boolean;
  auto_accept: boolean;
  expiration_applies: boolean;
  cfr_citation: string | null;
  sort_order: number;
}

interface Section {
  id: string;
  section_key: string;
  section_name: string;
  applies_to: string;
  items: RequirementItem[];
}

function ItemRow({
  item,
  isDraft,
  onToggle,
  onDelete,
}: {
  item: RequirementItem;
  isDraft: boolean;
  onToggle: (id: string, field: keyof RequirementItem, value: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <p className="font-medium text-ink">{item.item_name}</p>
        {item.cfr_citation && <p className="text-xs text-slate-400">{item.cfr_citation}</p>}
        {item.description && <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>}
      </td>
      <td className="px-4 py-3 text-slate-600 text-sm">{item.evidence_type ?? "—"}</td>
      <td className="px-4 py-3 text-center">
        {isDraft ? (
          <input type="checkbox" checked={item.is_required}
            onChange={(e) => onToggle(item.id, "is_required", e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-forest" />
        ) : (
          <StatusBadge tone={item.is_required ? "info" : "neutral"}>{item.is_required ? "Yes" : "No"}</StatusBadge>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {isDraft ? (
          <input type="checkbox" checked={item.is_critical_blocker}
            onChange={(e) => onToggle(item.id, "is_critical_blocker", e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-red-600" />
        ) : (
          item.is_critical_blocker
            ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><ShieldAlert className="h-3.5 w-3.5" />Critical</span>
            : <span className="text-xs text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {isDraft ? (
          <input type="checkbox" checked={item.auto_accept}
            onChange={(e) => onToggle(item.id, "auto_accept", e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-forest" />
        ) : (
          <StatusBadge tone={item.auto_accept ? "success" : "neutral"}>{item.auto_accept ? "Yes" : "No"}</StatusBadge>
        )}
      </td>
      {isDraft && (
        <td className="px-4 py-3 text-center">
          <button onClick={() => onDelete(item.id)}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </td>
      )}
    </tr>
  );
}

function AddItemForm({ sectionId, onAdd }: { sectionId: string; onAdd: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    item_key: "", item_name: "", description: "", evidence_type: "",
    cfr_citation: "", is_required: true, is_critical_blocker: false,
    auto_accept: false, expiration_applies: false,
  });
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/rules/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_id: sectionId, ...form }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setForm({ item_key: "", item_name: "", description: "", evidence_type: "",
        cfr_citation: "", is_required: true, is_critical_blocker: false,
        auto_accept: false, expiration_applies: false });
      onAdd();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-dashed border-line bg-slate-50 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Add Requirement Item</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input required placeholder="Item key (e.g. haccp_plan)" value={form.item_key}
          onChange={(e) => setForm((p) => ({ ...p, item_key: e.target.value }))}
          className="h-9 rounded-md border border-line bg-white px-3 text-sm text-ink placeholder-slate-400 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest" />
        <input required placeholder="Item name" value={form.item_name}
          onChange={(e) => setForm((p) => ({ ...p, item_name: e.target.value }))}
          className="h-9 rounded-md border border-line bg-white px-3 text-sm text-ink placeholder-slate-400 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest" />
        <input placeholder="Evidence type (e.g. certificate)" value={form.evidence_type}
          onChange={(e) => setForm((p) => ({ ...p, evidence_type: e.target.value }))}
          className="h-9 rounded-md border border-line bg-white px-3 text-sm text-ink placeholder-slate-400 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest" />
        <input placeholder="CFR citation (optional)" value={form.cfr_citation}
          onChange={(e) => setForm((p) => ({ ...p, cfr_citation: e.target.value }))}
          className="h-9 rounded-md border border-line bg-white px-3 text-sm text-ink placeholder-slate-400 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest" />
        <input placeholder="Description (optional)" value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          className="h-9 rounded-md border border-line bg-white px-3 text-sm text-ink placeholder-slate-400 focus:border-forest focus:outline-none focus:ring-1 focus:ring-forest sm:col-span-2" />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-700">
        {(["is_required", "is_critical_blocker", "auto_accept", "expiration_applies"] as const).map((field) => (
          <label key={field} className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={form[field]}
              onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 accent-forest" />
            {field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={isPending}
        className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white hover:bg-[#195f4d] disabled:opacity-50">
        <Plus className="h-4 w-4" />
        {isPending ? "Adding…" : "Add Item"}
      </button>
    </form>
  );
}

export function RequirementItemsPanel({
  sections,
  isDraft,
}: {
  sections: Section[];
  isDraft: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle(itemId: string, field: keyof RequirementItem, value: boolean) {
    startTransition(async () => {
      await fetch("/api/admin/rules/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, [field]: value }),
      });
      router.refresh();
    });
  }

  function handleDelete(itemId: string) {
    if (!confirm("Delete this requirement item?")) return;
    startTransition(async () => {
      await fetch("/api/admin/rules/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId }),
      });
      router.refresh();
    });
  }

  if (sections.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">No sections found for this version.</p>;
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.id} className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line bg-slate-50 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">{section.section_name}</h3>
              <p className="text-xs text-slate-500 capitalize">{section.applies_to} section · {section.items.length} item{section.items.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          {section.items.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-400">No items yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Requirement</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Evidence Type</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Required</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Critical Blocker</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Auto-Accept</th>
                  {isDraft && <th className="w-12 px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {section.items.map((item) => (
                  <ItemRow key={item.id} item={item} isDraft={isDraft}
                    onToggle={handleToggle} onDelete={handleDelete} />
                ))}
              </tbody>
            </table>
          )}
          {isDraft && <AddItemForm sectionId={section.id} onAdd={() => router.refresh()} />}
        </div>
      ))}
      {isPending && <p className="text-xs text-slate-400">Saving…</p>}
    </div>
  );
}
