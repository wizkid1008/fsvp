"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export const runtime = "edge";

export default function NewFsvpRecordPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<Array<{ id: string; company_name: string; country: string }>>([]);
  const [facilities, setFacilities] = useState<Array<{ id: string; facility_name: string; supplier_id: string | null }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; product_name: string; facility_id: string | null; supplier_id: string | null }>>([]);
  const [ruleVersions, setRuleVersions] = useState<Array<{ id: string; version_number: number }>>([]);

  const [supplierId, setSupplierId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [productId, setProductId] = useState("");
  const [ruleVersionId, setRuleVersionId] = useState("");

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    async function load() {
      const [suppliersRes, facilitiesRes, productsRes, versionsRes] = await Promise.all([
        (supabase.from("suppliers") as any).select("id, company_name, country").order("company_name"),
        (supabase.from("facilities_verify") as any).select("id, facility_name, supplier_id").order("facility_name"),
        (supabase.from("products_verify") as any).select("id, product_name, facility_id, supplier_id").order("product_name"),
        (supabase.from("rule_versions") as any).select("id, version_number").eq("status", "published").order("version_number", { ascending: false }),
      ]);
      setSuppliers(suppliersRes.data ?? []);
      setFacilities(facilitiesRes.data ?? []);
      setProducts(productsRes.data ?? []);
      const vers = versionsRes.data ?? [];
      setRuleVersions(vers);
      if (vers.length > 0) setRuleVersionId(vers[0].id);
    }
    void load();
  }, []);

  const filteredFacilities = supplierId
    ? facilities.filter((f) => f.supplier_id === supplierId)
    : facilities;

  const filteredProducts = facilityId
    ? products.filter((p) => p.facility_id === facilityId)
    : supplierId
      ? products.filter((p) => p.supplier_id === supplierId)
      : products;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supplierId || !facilityId || !productId || !ruleVersionId) {
      setError("All fields are required.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/fsvp-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: supplierId, facility_id: facilityId, product_id: productId, rule_version_id: ruleVersionId }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      router.push(`/fsvp-records/${json.id}`);
    });
  }

  return (
    <AppShell role="us_importer">
      <div className="flex flex-col gap-4 border-b border-line pb-6">
        <div>
          <a href="/fsvp-records" className="text-sm text-slate-500 hover:text-ink">← FSVP Records</a>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink">New FSVP Record</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Select the supplier, facility, and product for this record. Each combination can have one FSVP record per importer.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 max-w-xl space-y-5">
        <div>
          <label className="block text-sm font-semibold text-ink">
            Supplier <span className="text-red-500">*</span>
          </label>
          <select
            value={supplierId}
            onChange={(e) => { setSupplierId(e.target.value); setFacilityId(""); setProductId(""); }}
            required
            className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink focus:border-forest focus:outline-none"
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.company_name} — {s.country}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink">
            Facility <span className="text-red-500">*</span>
          </label>
          <select
            value={facilityId}
            onChange={(e) => { setFacilityId(e.target.value); setProductId(""); }}
            required
            disabled={!supplierId}
            className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink focus:border-forest focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">Select facility…</option>
            {filteredFacilities.map((f) => (
              <option key={f.id} value={f.id}>{f.facility_name}</option>
            ))}
          </select>
          {supplierId && filteredFacilities.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">No facilities found for this supplier.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink">
            Product <span className="text-red-500">*</span>
          </label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
            disabled={!facilityId}
            className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink focus:border-forest focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">Select product…</option>
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>{p.product_name}</option>
            ))}
          </select>
          {facilityId && filteredProducts.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">No products found for this facility.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-ink">
            Rule Version <span className="text-red-500">*</span>
          </label>
          <select
            value={ruleVersionId}
            onChange={(e) => setRuleVersionId(e.target.value)}
            required
            className="mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink focus:border-forest focus:outline-none"
          >
            <option value="">Select rule version…</option>
            {ruleVersions.map((v) => (
              <option key={v.id} value={v.id}>Version {v.version_number} (Published)</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            The rule version is locked at creation and preserved for audit history.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-10 items-center rounded-md bg-forest px-6 text-sm font-semibold text-white hover:bg-[#195f4d] disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Create FSVP Record"}
          </button>
          <a
            href="/fsvp-records"
            className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </AppShell>
  );
}
