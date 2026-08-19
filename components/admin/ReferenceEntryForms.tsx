"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

export type CommodityOption = {
  id: string;
  common_name: string;
  scientific_name: string | null;
  commodity_class: string;
  plant_part: string | null;
  is_propagative: boolean;
};

export type CountryOption = { country_code: string; country_name: string };

const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
const areaClass =
  "mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest";
const labelClass = "block text-sm font-medium text-slate-700";
const primaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:opacity-60";
const secondaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60";

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-auto my-8 w-full max-w-3xl rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 transition hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function responseError(json: unknown, fallback: string): string {
  if (json && typeof json === "object" && "error" in json && typeof json.error === "string") {
    return json.error;
  }
  return fallback;
}

function CommodityForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [commodityClass, setCommodityClass] = useState("");
  const [pending, startTransition] = useTransition();
  const isPlantLike = ["fruit", "vegetable", "nut", "grain", "herb_spice"].includes(commodityClass);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const res = await fetch("/api/commodities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            common_name: form.get("common_name"),
            scientific_name: form.get("scientific_name"),
            commodity_class: form.get("commodity_class"),
            plant_part: form.get("plant_part"),
            is_propagative: form.get("is_propagative") === "on",
            fda_industry_code: form.get("fda_industry_code"),
            fda_class_code: form.get("fda_class_code"),
            fda_product_group: form.get("fda_product_group"),
            notes: form.get("notes"),
          }),
        });
        const json: unknown = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(responseError(json, "Could not add the commodity."));
          return;
        }
        onClose();
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <Modal title="Add commodity" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-6">
        <p className="text-sm leading-relaxed text-slate-600">
          Classify the exact material that enters. Different plant parts and propagative forms are
          separate regulatory questions even when they share a common name.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Common name <span className="text-red-500">*</span>
            <input name="common_name" required className={inputClass} placeholder="Mango" />
          </label>
          <label className={labelClass}>
            Scientific name
            <input name="scientific_name" className={inputClass} placeholder="Mangifera indica" />
          </label>
          <label className={labelClass}>
            Commodity class <span className="text-red-500">*</span>
            <select
              name="commodity_class"
              required
              className={inputClass}
              value={commodityClass}
              onChange={(event) => setCommodityClass(event.target.value)}
            >
              <option value="" disabled>Select class</option>
              {[
                "fruit", "vegetable", "nut", "grain", "herb_spice", "seafood",
                "meat_poultry", "dairy", "egg", "beverage", "processed_food",
                "supplement", "other",
              ].map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          {isPlantLike ? (
            <>
              <label className={labelClass}>
                Plant part
                <select name="plant_part" required className={inputClass} defaultValue="">
                  <option value="" disabled>Select plant part</option>
                  {["not_applicable", "fruit", "leaf", "root", "seed", "stem", "flower", "whole_plant", "bulb", "tuber"]
                    .map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 pt-7 text-sm font-medium text-slate-700">
                <input name="is_propagative" type="checkbox" className="h-4 w-4 rounded border-line text-forest" />
                Capable of propagation
              </label>
            </>
          ) : (
            <input type="hidden" name="plant_part" value="not_applicable" />
          )}
        </div>

        {/* Only the commodity-level third of a product code. Subclass is the
            container material and PIC is the process, so both describe a
            product as packed and are recorded against the product instead. */}
        <fieldset className="rounded-md border border-line bg-slate-50 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">FDA product code (commodity part)</legend>
          <p className="text-xs leading-relaxed text-slate-500">
            Optional, and only the part that describes what the thing is. In FDA&apos;s example
            38BEE27 — canned concentrated tomato soup — that is industry <strong>38</strong>, class{" "}
            <strong>B</strong> and group <strong>27</strong>. The two middle characters are the
            metal can and the sterilising retort, which belong to a shipment rather than a commodity.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label className={labelClass}>
              Industry
              <input name="fda_industry_code" maxLength={2} className={inputClass} placeholder="38" />
            </label>
            <label className={labelClass}>
              Class
              <input name="fda_class_code" maxLength={1} className={inputClass} placeholder="B" />
            </label>
            <label className={labelClass}>
              Product group
              <input name="fda_product_group" maxLength={2} className={inputClass} placeholder="27" />
            </label>
          </div>
        </fieldset>
        <label className={labelClass}>
          Taxonomy notes
          <textarea name="notes" rows={3} className={areaClass} placeholder="Distinguishing details or aliases" />
        </label>
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? "Adding…" : "Add commodity"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RuleForm({
  commodities,
  countries,
  onClose,
}: {
  commodities: CommodityOption[];
  countries: CountryOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [originScope, setOriginScope] = useState<"country" | "region">("country");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNote(null);
    const form = new FormData(event.currentTarget);
    const commaList = (name: string) =>
      String(form.get(name) ?? "").split(",").map((value) => value.trim()).filter(Boolean);

    startTransition(async () => {
      try {
        const res = await fetch("/api/reference-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commodity_id: form.get("commodity_id"),
            origin_country: originScope === "country" ? form.get("origin_country") : null,
            origin_region: originScope === "region" ? form.get("origin_region") : null,
            intended_use: form.get("intended_use"),
            processing_state: form.get("processing_state"),
            admissibility: form.get("admissibility"),
            permit_required: form.get("permit_required") === "on",
            phyto_required: form.get("phyto_required") === "on",
            treatment_required: form.get("treatment_required") === "on",
            peq_required: form.get("peq_required") === "on",
            additional_declarations: commaList("additional_declarations"),
            designated_ports: commaList("designated_ports"),
            conditions_text: form.get("conditions_text"),
            citation: form.get("citation"),
            source_url: form.get("source_url"),
            cfr_part: form.get("cfr_part"),
          }),
        });
        const json = await res.json().catch(() => ({})) as { error?: string; note?: string };
        if (!res.ok) {
          setError(json.error ?? "Could not enter the rule.");
          return;
        }
        setNote(json.note ?? "Recorded as a draft.");
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      }
    });
  }

  return (
    <Modal title="Enter country-commodity rule" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-6">
        <p className="text-sm leading-relaxed text-slate-600">
          Every entry is saved as a draft. A different administrator must confirm it against the
          cited source before it can support an admissibility determination.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Commodity <span className="text-red-500">*</span>
            <select name="commodity_id" required className={inputClass} defaultValue="">
              <option value="" disabled>Select commodity</option>
              {commodities.map((commodity) => (
                <option key={commodity.id} value={commodity.id}>
                  {commodity.common_name}{commodity.plant_part && commodity.plant_part !== "not_applicable" ? ` — ${commodity.plant_part}` : ""}
                  {commodity.is_propagative ? " — propagative" : ""}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className={labelClass}>Origin scope</span>
            <div className="mt-2 flex gap-4 text-sm text-slate-700">
              {(["country", "region"] as const).map((scope) => (
                <label key={scope} className="flex items-center gap-2">
                  <input type="radio" checked={originScope === scope} onChange={() => setOriginScope(scope)} />
                  {scope === "country" ? "Country" : "Region (manual review)"}
                </label>
              ))}
            </div>
          </div>
          {originScope === "country" ? (
            <label className={labelClass}>
              Origin country <span className="text-red-500">*</span>
              <select name="origin_country" required className={inputClass} defaultValue="">
                <option value="" disabled>Select country</option>
                {countries.map((country) => (
                  <option key={country.country_code} value={country.country_code}>{country.country_name}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className={labelClass}>
              Origin region <span className="text-red-500">*</span>
              <input name="origin_region" required className={inputClass} placeholder="South America" />
            </label>
          )}
          <label className={labelClass}>
            Intended use <span className="text-red-500">*</span>
            <select name="intended_use" className={inputClass} defaultValue="any">
              {["any", "consumption", "processing", "propagation", "research"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className={labelClass}>
            Processing state <span className="text-red-500">*</span>
            <select name="processing_state" className={inputClass} defaultValue="any">
              {["any", "fresh", "frozen", "dried", "cooked", "canned", "other"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className={labelClass}>
            Outcome <span className="text-red-500">*</span>
            <select name="admissibility" required className={inputClass} defaultValue="">
              <option value="" disabled>Select outcome</option>
              <option value="permitted">Permitted</option>
              <option value="restricted">Restricted</option>
              <option value="prohibited">Prohibited</option>
            </select>
          </label>
          <label className={labelClass}>
            Citation <span className="text-red-500">*</span>
            <input name="citation" required className={inputClass} placeholder="ACIR entry or 7 CFR citation" />
          </label>
          <label className={labelClass}>
            Source URL <span className="text-red-500">*</span>
            <input name="source_url" type="url" required className={inputClass} placeholder="https://..." />
          </label>
          <label className={labelClass}>
            CFR part
            <input name="cfr_part" className={inputClass} placeholder="7 CFR 319" />
          </label>
        </div>

        <fieldset>
          <legend className={labelClass}>Required conditions</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-700 sm:grid-cols-4">
            {[
              ["permit_required", "Import permit"],
              ["phyto_required", "Phytosanitary certificate"],
              ["treatment_required", "Treatment"],
              ["peq_required", "Post-entry quarantine"],
            ].map(([name, label]) => (
              <label key={name} className="flex items-center gap-2">
                <input name={name} type="checkbox" className="h-4 w-4 rounded border-line text-forest" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Additional declarations
            <input name="additional_declarations" className={inputClass} placeholder="Comma-separated" />
          </label>
          <label className={labelClass}>
            Designated ports
            <input name="designated_ports" className={inputClass} placeholder="Comma-separated" />
          </label>
        </div>
        <label className={labelClass}>
          Conditions and limitations
          <textarea name="conditions_text" rows={3} className={areaClass} placeholder="State the operational conditions exactly enough to act on them." />
        </label>

        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {note && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{note}</p>}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className={secondaryButton}>Close</button>
          <button type="submit" disabled={pending || commodities.length === 0 || Boolean(note)} className={primaryButton}>
            {pending ? "Recording…" : note ? "Draft recorded" : "Record draft rule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ReferenceEntryActions({
  commodities,
  countries,
}: {
  commodities: CommodityOption[];
  countries: CountryOption[];
}) {
  const [open, setOpen] = useState<"commodity" | "rule" | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen("commodity")} className={secondaryButton}>
          <Plus className="h-4 w-4" /> Add commodity
        </button>
        <button type="button" onClick={() => setOpen("rule")} disabled={commodities.length === 0} className={primaryButton}>
          <Plus className="h-4 w-4" /> Enter rule
        </button>
      </div>
      {open === "commodity" && <CommodityForm onClose={() => setOpen(null)} />}
      {open === "rule" && (
        <RuleForm commodities={commodities} countries={countries} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
