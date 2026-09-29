"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PackageSearch, Search, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ProductLifecycleDialog } from "@/components/products/ProductLifecycleDialog";
import { InlineAddExporter } from "@/components/products/InlineAddExporter";
import { InlineAddFacility } from "@/components/products/InlineAddFacility";
import { LIFECYCLE_LABEL, retentionEndsOn, type ProductLifecycle } from "@/lib/fsvp/product-lifecycle";
import type { Country } from "@/types/database";
import type { EvidenceProgress } from "@/lib/readiness/evidence-scope";
import { EvidenceProgressCell, UploadDocumentsLink } from "@/components/evidence/EvidenceProgressCell";
import { OpenLink } from "@/components/ui/OpenLink";
import { approvalTone, evidenceScoreLabel } from "@/lib/approval/status";
import { ProductFsvpStatus, useProductStandings } from "@/components/products/ProductStandings";

export type CountryOption = Pick<Country, "country_code" | "country_name">;

export type SupplierOption = {
  id: string;
  company_name: string;
};

export type FacilityOption = {
  id: string;
  facility_name: string;
  supplier_id?: string | null;
  supplier_ids?: string[];
  country?: string | null;
};

export type ProductRow = {
  id: string;
  product_name: string;
  product_description: string | null;
  country_of_origin: string | null;
  intended_use: string | null;
  raw_or_processed: string | null;
  ingredient_list: string | null;
  allergen_information: string | null;
  supplier_id: string | null;
  facility_id: string | null;
  commodity_id: string | null;
  commodities: { common_name: string; plant_part: string | null } | null;
  suppliers: { company_name: string } | null;
  facilities_verify: { facility_name: string } | null;
  evidence_count?: number;
  /** Required product items by status; absent when no rule version is published. */
  evidence_progress?: EvidenceProgress;
  approval_status?: string;
  admissibility_status?: "unclassified" | "not_determined" | "action_required" | "permitted" | "restricted" | "prohibited" | "importer_review";
  lifecycle?: ProductLifecycle;
  discontinued_on?: string | null;
};

export function lifecycleTone(lifecycle: ProductLifecycle): "success" | "warning" | "neutral" {
  // "Imported" is not a good/bad judgement — it says the obligation is live.
  // Discontinued is neutral rather than a failure: stopping is a legitimate
  // outcome, and the record is being retained correctly.
  if (lifecycle === "active") return "success";
  if (lifecycle === "not_imported") return "neutral";
  return "warning";
}


function admissibilityTone(status?: ProductRow["admissibility_status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "permitted") return "success";
  if (status === "restricted" || status === "action_required" || status === "not_determined" || status === "unclassified") return "warning";
  if (status === "prohibited") return "danger";
  return "neutral";
}

export const INTENDED_USES = [
  { value: "", label: "Select intended use" },
  { value: "ready_to_eat", label: "Ready to eat" },
  { value: "further_processed", label: "Further processed" },
  { value: "animal_feed", label: "Animal feed" },
  { value: "ingredient", label: "Ingredient" },
  { value: "other", label: "Other" }
];

export const PROCESSING_STATES = [
  { value: "", label: "Select processing state" },
  { value: "raw", label: "Raw" },
  { value: "processed", label: "Processed" },
  { value: "both", label: "Both" }
];

const MAJOR_ALLERGENS = [
  "Milk", "Eggs", "Fish", "Crustacean shellfish", "Tree nuts",
  "Peanuts", "Wheat", "Soybeans", "Sesame"
];

const OTHER_ALLERGENS = [
  "Celery", "Mustard", "Lupin", "Molluscs", "Sulphites", "Buckwheat", "Gluten (barley/rye)"
];

function parseAllergens(value: string | null): { selected: string[]; other: string } {
  if (!value) return { selected: [], other: "" };
  const known = new Set([...MAJOR_ALLERGENS, ...OTHER_ALLERGENS]);
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  const selected = parts.filter((p) => known.has(p));
  const other = parts.filter((p) => !known.has(p)).join(", ");
  return { selected, other };
}

function clean(value: FormDataEntryValue | null) {
  const text = value?.toString().trim() ?? "";
  return text || null;
}

function labelize(value: string | null) {
  return value ? value.replace(/_/g, " ") : "-";
}

function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Could not save product.";
}

/** A sentinel option value, not a real id — chosen from a select to reveal the inline create form. */
const ADD_NEW = "__add_new__";

/**
 * Which part of a product the form edits. The product page edits one section
 * at a time (Basics, Composition), and adding a product asks only for Basics —
 * the rest is filled in on the product page it opens onto. /api/products/save
 * writes every field, so the sections not shown still travel in the form as
 * hidden inputs carrying their current values; editing one section can never
 * blank another.
 */
export type ProductFormSection = "all" | "basics" | "composition";

export function AddProductForm({
  countries,
  product,
  onClose,
  facilities,
  suppliers,
  presetFacility,
  canManageExporters,
  show = "all",
  openAfterCreate = false,
}: {
  countries: CountryOption[];
  facilities: FacilityOption[];
  product?: ProductRow | null;
  onClose: () => void;
  suppliers: SupplierOption[];
  /** Arrived from a facility's row — start with it and its exporter chosen. */
  presetFacility?: { facilityId: string; supplierId: string } | null;
  /** Only an importer/administrator may create an exporter record — see
   *  /api/exporters/create. An exporter viewing their own product list has
   *  exactly one supplier (themselves) and no reason to add another. */
  canManageExporters: boolean;
  show?: ProductFormSection;
  /** After creating, go to the new product's page, where its next step is. */
  openAfterCreate?: boolean;
}) {
  const showBasics = show === "all" || show === "basics";
  const showComposition = show === "all" || show === "composition";
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // The exporter must be set before the facility list is enabled, so a preset
  // has to fill both — otherwise the facility select renders disabled and the
  // preselection looks broken.
  const [supplierId, setSupplierId] = useState(
    product?.supplier_id ?? presetFacility?.supplierId ?? (suppliers.length === 1 ? suppliers[0]?.id ?? "" : "")
  );
  const [facilityId, setFacilityId] = useState(product?.facility_id ?? presetFacility?.facilityId ?? "");
  const [pending, startTransition] = useTransition();

  // Exporters/facilities created from inside this form, so the one just added
  // is selectable immediately — before the product is even saved, and without
  // waiting on a router.refresh() of the whole page to see it.
  const [addedSuppliers, setAddedSuppliers] = useState<SupplierOption[]>([]);
  const [addedFacilities, setAddedFacilities] = useState<FacilityOption[]>([]);
  const [addingExporter, setAddingExporter] = useState(false);
  const [addingFacility, setAddingFacility] = useState(false);

  const allSuppliers = [...suppliers, ...addedSuppliers];
  const allFacilities = [...facilities, ...addedFacilities];

  const supplierFacilities = allFacilities.filter((facility) => {
    const supplierIds = facility.supplier_ids && facility.supplier_ids.length > 0
      ? facility.supplier_ids
      : facility.supplier_id
        ? [facility.supplier_id]
        : [];
    return supplierIds.includes(supplierId);
  });
  const selectedFacility = allFacilities.find((facility) => facility.id === facilityId) ?? null;
  const facilityCountry = selectedFacility?.country ?? null;
  const initialAllergens = parseAllergens(product?.allergen_information ?? null);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>(initialAllergens.selected);
  const [otherAllergens, setOtherAllergens] = useState(initialAllergens.other);

  function toggleAllergen(name: string) {
    setSelectedAllergens((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      try {
        const selectedSupplierId = clean(formData.get("supplier_id"));
        const selectedFacilityId = clean(formData.get("facility_id"));

        if (!selectedSupplierId || !allSuppliers.some((supplier) => supplier.id === selectedSupplierId)) {
          setError("Select an exporter from the list, or add a new one.");
          return;
        }

        // Facility is optional — a product can exist against just its exporter
        // and be assigned a facility later, from the product's own page. But
        // if one WAS chosen it must genuinely belong to the chosen exporter,
        // and country of origin comes from it, so the two travel together.
        let country: string | null = null;
        if (selectedFacilityId) {
          const matchedFacility = allFacilities.find((facility) => {
            const supplierIds = facility.supplier_ids && facility.supplier_ids.length > 0
              ? facility.supplier_ids
              : facility.supplier_id
                ? [facility.supplier_id]
                : [];
            return facility.id === selectedFacilityId && supplierIds.includes(selectedSupplierId);
          });

          if (!matchedFacility) {
            setError("Select a facility that is available to the selected exporter.");
            return;
          }

          country = matchedFacility.country ?? null;
          if (!country) {
            setError("The selected facility has no country set. Add a country to the facility's address before creating a product.");
            return;
          }
        }

        const allergenList = [...selectedAllergens, ...otherAllergens.split(",").map((a) => a.trim()).filter(Boolean)];
        const allergenInformation = allergenList.length > 0 ? allergenList.join(", ") : null;

        const payload = {
          product_name: formData.get("product_name")?.toString().trim() ?? "",
          supplier_id: selectedSupplierId,
          facility_id: selectedFacilityId || null,
          country_of_origin: country,
          raw_or_processed: clean(formData.get("raw_or_processed")),
          intended_use: clean(formData.get("intended_use")),
          ingredient_list: clean(formData.get("ingredient_list")),
          allergen_information: allergenInformation,
          product_description: clean(formData.get("product_description"))
        };

        const res = await fetch("/api/products/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(product ? { ...payload, id: product.id } : payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not save product.");

        if (!product && openAfterCreate && json.id) {
          router.push(`/products/${json.id}`);
          return;
        }
        router.refresh();
        onClose();
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  const inputClass = "mt-1.5 h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest";
  const textareaClass = "mt-1.5 min-h-20 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-forest";
  const labelClass = "block text-sm font-medium text-slate-700";

  return (
    // The panel is capped at 90vh and scrolls internally. It used to grow to
    // whatever the form needed inside a `fixed inset-0` overlay, so on any
    // viewport shorter than the form the Cancel and Save buttons sat off-screen
    // with nothing able to scroll them into view — the dialog could be filled
    // in but not submitted or dismissed except by the X.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-line bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold text-ink">
            {!product ? "Add product" : show === "basics" ? "Edit basics" : show === "composition" ? "Edit composition" : "Edit product"}
          </h2>
          <button type="button" onClick={onClose} className="rounded p-1 transition hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {!product && show === "basics" && (
            <p className="text-sm text-slate-500">
              Just the basics. Classification, composition and documents are filled in on the product
              page, which opens next.
            </p>
          )}
          {/* The sections not being edited, carried unchanged — see ProductFormSection. */}
          {!showBasics && (
            <>
              <input type="hidden" name="product_name" value={product?.product_name ?? ""} />
              <input type="hidden" name="supplier_id" value={supplierId} />
              <input type="hidden" name="facility_id" value={facilityId} />
            </>
          )}
          {!showComposition && product && (
            <>
              <input type="hidden" name="intended_use" value={product.intended_use ?? ""} />
              <input type="hidden" name="raw_or_processed" value={product.raw_or_processed ?? ""} />
              <input type="hidden" name="ingredient_list" value={product.ingredient_list ?? ""} />
              <input type="hidden" name="product_description" value={product.product_description ?? ""} />
            </>
          )}
          {showBasics && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Product Name <span className="text-red-500">*</span>
              <input name="product_name" required defaultValue={product?.product_name ?? ""} className={inputClass} placeholder="Mango puree" />
            </label>
            <div className={labelClass}>
              Exporter <span className="text-red-500">*</span>
              {addingExporter ? (
                <InlineAddExporter
                  countries={countries}
                  onCancel={() => setAddingExporter(false)}
                  onCreated={(exporter) => {
                    setAddedSuppliers((prev) => [...prev, { id: exporter.id, company_name: exporter.company_name }]);
                    setSupplierId(exporter.id);
                    setFacilityId("");
                    setAddingExporter(false);
                  }}
                />
              ) : (
                <select
                  name="supplier_id"
                  required
                  className={inputClass}
                  value={supplierId}
                  onChange={(event) => {
                    if (event.target.value === ADD_NEW) {
                      setAddingExporter(true);
                      return;
                    }
                    setSupplierId(event.target.value);
                    setFacilityId("");
                  }}
                >
                  <option value="">Select exporter</option>
                  {allSuppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.company_name}</option>
                  ))}
                  {canManageExporters && <option value={ADD_NEW}>+ Add a new exporter…</option>}
                </select>
              )}
            </div>
            <div className={labelClass}>
              Facility
              {addingFacility && supplierId ? (
                <InlineAddFacility
                  supplierId={supplierId}
                  countries={countries}
                  onCancel={() => setAddingFacility(false)}
                  onCreated={(facility) => {
                    setAddedFacilities((prev) => [
                      ...prev,
                      { id: facility.id, facility_name: facility.facility_name, supplier_id: supplierId, country: facility.country },
                    ]);
                    setFacilityId(facility.id);
                    setAddingFacility(false);
                  }}
                />
              ) : (
                <>
                  <select
                    name="facility_id"
                    className={inputClass}
                    value={facilityId}
                    onChange={(event) => {
                      if (event.target.value === ADD_NEW) {
                        setAddingFacility(true);
                        return;
                      }
                      setFacilityId(event.target.value);
                    }}
                    disabled={!supplierId}
                  >
                    <option value="">
                      {!supplierId ? "Select an exporter first" : "Not yet assigned — add later"}
                    </option>
                    {supplierFacilities.map((facility) => (
                      <option key={facility.id} value={facility.id}>{facility.facility_name}</option>
                    ))}
                    {supplierId && <option value={ADD_NEW}>+ Add a new facility…</option>}
                  </select>
                  {supplierId && !facilityId && (
                    <span className="mt-1 block text-xs text-slate-500">
                      A product can be created without one. Assign a facility here, or later from
                      the product's own page.
                    </span>
                  )}
                </>
              )}
            </div>
            <label className={labelClass}>
              Country of origin
              <input
                readOnly
                disabled
                value={facilityCountry ?? (facilityId ? "Facility has no country set" : "Not yet set — comes from the facility")}
                className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-600`}
              />
              <span className="mt-1 block text-xs text-slate-400">Inherited from the selected facility.</span>
            </label>
          </div>
          )}

          {showComposition && (
          <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Intended Use
              <select name="intended_use" className={inputClass} defaultValue={product?.intended_use ?? ""}>
                {INTENDED_USES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Processing State
              <select name="raw_or_processed" className={inputClass} defaultValue={product?.raw_or_processed ?? ""}>
                {PROCESSING_STATES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <p className={labelClass}>Allergens — FDA Major Allergens</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {MAJOR_ALLERGENS.map((allergen) => (
                <label key={allergen} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedAllergens.includes(allergen)}
                    onChange={() => toggleAllergen(allergen)}
                    className="h-4 w-4 rounded border-line text-forest focus:ring-forest"
                  />
                  {allergen}
                </label>
              ))}
            </div>
            <p className={`${labelClass} mt-3`}>Other Regulated Allergens</p>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {OTHER_ALLERGENS.map((allergen) => (
                <label key={allergen} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedAllergens.includes(allergen)}
                    onChange={() => toggleAllergen(allergen)}
                    className="h-4 w-4 rounded border-line text-forest focus:ring-forest"
                  />
                  {allergen}
                </label>
              ))}
            </div>
            <label className={`${labelClass} mt-3 block`}>
              Other (comma-separated, not listed above)
              <input
                value={otherAllergens}
                onChange={(e) => setOtherAllergens(e.target.value)}
                className={inputClass}
                placeholder="e.g. coconut"
              />
            </label>
          </div>

          <label className={labelClass}>
            Ingredients
            <textarea name="ingredient_list" defaultValue={product?.ingredient_list ?? ""} className={textareaClass} placeholder="Ingredient list or short description" />
          </label>
          <label className={labelClass}>
            Product Description
            <textarea name="product_description" defaultValue={product?.product_description ?? ""} className={textareaClass} placeholder="Optional product notes" />
          </label>
          </>
          )}
          </div>

          {/* Outside the scroll region: a save error the user has to scroll to
              find is an error they will not see. */}
          <div className="shrink-0 space-y-3 border-t border-line px-6 py-4">
            {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                Cancel
              </button>
              <button disabled={pending} className="h-10 rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60">
                {pending ? "Saving..." : product ? "Save" : openAfterCreate ? "Add and open" : "Add product"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProductTable({
  countries,
  facilities,
  products,
  supplierHref = "/exporters",
  suppliers,
  presetFacility,
  canEditLifecycle = false,
  canManageExporters = false
}: {
  countries: CountryOption[];
  facilities: FacilityOption[];
  products: ProductRow[];
  supplierHref?: string;
  suppliers: SupplierOption[];
  /** Set by /products?facility=<id>, arriving from that facility's row. */
  presetFacility?: { facilityId: string; supplierId: string } | null;
  /**
   * Only the importing organization can say whether it imports a food — the
   * API enforces the same rule. Exporters see the state but cannot change it.
   */
  canEditLifecycle?: boolean;
  /** Passed through to AddProductForm — see its own prop for why. */
  canManageExporters?: boolean;
}) {
  // Open straight into the form when the link that got here already said what
  // was wanted. See NextStepBanner for why these threads exist at all.
  // Inside ProductStandingsProvider (the importer's view) the Status column is
  // the product's FSVP standing — the dashboard's "Approved". Outside it (the
  // exporter's own list) there is no FSVP record to stand on, and the column is
  // the document score, labelled as such so the two never share the word.
  const fsvpStandings = useProductStandings() !== null;
  const [showForm, setShowForm] = useState(Boolean(presetFacility));
  const [lifecycleProduct, setLifecycleProduct] = useState<ProductRow | null>(null);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  // A facility is no longer required to open this form — AddProductForm can
  // add one inline, or leave the product unassigned until later. An exporter
  // is still required in the end, but canManageExporters means one can be
  // added inline too, so the only account that should ever see this disabled
  // is a supplier/exporter viewer with no supplier record of their own yet.
  const canAddProduct = suppliers.length > 0 || canManageExporters;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      const matchesSearch = !q ||
        p.product_name.toLowerCase().includes(q) ||
        (p.suppliers?.company_name.toLowerCase().includes(q) ?? false) ||
        (p.facilities_verify?.facility_name.toLowerCase().includes(q) ?? false) ||
        (p.country_of_origin?.toLowerCase().includes(q) ?? false) ||
        (p.allergen_information?.toLowerCase().includes(q) ?? false);
      const matchesSupplier = !supplierFilter || p.supplier_id === supplierFilter;
      return matchesSearch && matchesSupplier;
    });
  }, [products, search, supplierFilter]);

  function openAddForm() {
    setShowForm(true);
  }

  // Adding only: a product is edited on its own page, section by section.
  return (
    <>
      {showForm ? (
        <AddProductForm
          countries={countries}
          facilities={facilities}
          onClose={() => setShowForm(false)}
          suppliers={suppliers}
          presetFacility={presetFacility}
          canManageExporters={canManageExporters}
          show="basics"
          openAfterCreate
        />
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-forest"
          />
        </div>
        {suppliers.length > 1 && (
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="h-10 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-forest"
          >
            <option value="">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.company_name}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={!canAddProduct}
          onClick={openAddForm}
          className="inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          Add product
        </button>
      </div>

      {products.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-slate-50 px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-line bg-white shadow-soft">
            <PackageSearch className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">No products yet</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
            {canAddProduct
              ? "Add a product under an exporter — its facility can be assigned now or later — then map FSVP requirements and verification evidence."
              : "Your account is not yet linked to an exporter, so there is nothing to add a product under."}
          </p>
          {canAddProduct ? (
            <button
              type="button"
              onClick={openAddForm}
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
            >
              Add your first product
            </button>
          ) : (
            <a
              href={supplierHref}
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-forest px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d]"
            >
              Add a supplier first
            </a>
          )}
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-line bg-white shadow-soft">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">
              No products match your search.
            </div>
          ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Product</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Imported</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">
                  {fsvpStandings ? "FSVP status" : "Evidence score"}
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Admissibility</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Supplier</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Facility</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Origin</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Intended Use</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Allergens</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Evidence</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((product) => (
                <tr key={product.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-ink">
                    <a href={`/products/${product.id}`} className="font-semibold text-forest underline underline-offset-2 hover:decoration-2">
                      {product.product_name}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const lifecycle = product.lifecycle ?? "active";
                      const badge = (
                        <StatusBadge tone={lifecycleTone(lifecycle)}>
                          {LIFECYCLE_LABEL[lifecycle]}
                        </StatusBadge>
                      );
                      const retentionEnd = retentionEndsOn({
                        lifecycle,
                        discontinuedOn: product.discontinued_on ?? null,
                      });
                      return (
                        <>
                          {canEditLifecycle ? (
                            <button
                              type="button"
                              onClick={() => setLifecycleProduct(product)}
                              title="Change whether this food is imported"
                              className="rounded-md transition hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest"
                            >
                              {badge}
                            </button>
                          ) : (
                            badge
                          )}
                          {retentionEnd && (
                            // The date the records may be disposed of, which is
                            // the thing anyone looking at a discontinued
                            // product actually needs to know.
                            <p className="mt-1 text-xs text-slate-500">Retained to {retentionEnd}</p>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {fsvpStandings ? (
                      <ProductFsvpStatus productId={product.id} />
                    ) : (
                      <StatusBadge tone={approvalTone(product.approval_status)}>
                        {evidenceScoreLabel(product.approval_status)}
                      </StatusBadge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <a href={`/products/${product.id}`}>
                      <StatusBadge tone={admissibilityTone(product.admissibility_status)}>
                        {labelize(product.admissibility_status ?? "importer_review")}
                      </StatusBadge>
                    </a>
                    {product.commodities?.common_name && (
                      <p className="mt-1 text-xs text-slate-500">
                        {product.commodities.common_name}
                        {product.commodities.plant_part && product.commodities.plant_part !== "not_applicable"
                          ? ` (${product.commodities.plant_part})`
                          : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{product.suppliers?.company_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{product.facilities_verify?.facility_name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{product.country_of_origin ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{labelize(product.intended_use)}</td>
                  <td className="px-4 py-3 text-slate-600">{product.allergen_information ?? "None declared"}</td>
                  <td className="px-4 py-3">
                    {product.evidence_progress && product.evidence_progress.required > 0 ? (
                      <EvidenceProgressCell href={`/products/${product.id}`} progress={product.evidence_progress} noun="product documents" />
                    ) : (
                      <div>
                        <a
                          href={`/products/${product.id}#documents`}
                          className="font-semibold text-forest hover:underline"
                        >
                          {product.evidence_count ?? 0} documents
                        </a>
                        <div><UploadDocumentsLink href={`/products/${product.id}`} /></div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <OpenLink href={`/products/${product.id}`} label={product.product_name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
      )}

      {lifecycleProduct && (
        <ProductLifecycleDialog
          product={{
            id: lifecycleProduct.id,
            product_name: lifecycleProduct.product_name,
            lifecycle: lifecycleProduct.lifecycle ?? "active",
            discontinued_on: lifecycleProduct.discontinued_on ?? null,
          }}
          onClose={() => setLifecycleProduct(null)}
        />
      )}
    </>
  );
}
