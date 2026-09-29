"use client";

import { useState } from "react";
import { Edit2 } from "lucide-react";
import {
  AddProductForm,
  INTENDED_USES,
  PROCESSING_STATES,
  lifecycleTone,
  type CountryOption,
  type FacilityOption,
  type ProductFormSection,
  type ProductRow,
  type SupplierOption,
} from "@/components/products/ProductTable";
import { ProductLifecycleDialog } from "@/components/products/ProductLifecycleDialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LIFECYCLE_LABEL, type ProductLifecycle } from "@/lib/fsvp/product-lifecycle";

/**
 * The client pieces of the product page's sections: the Edit buttons that open
 * one section of the product form, the import-status control, and labels that
 * live beside the form's option lists. The page itself stays a server
 * component and composes these into DetailSections.
 */

const buttonClass =
  "inline-flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-semibold text-slate-600 transition hover:border-forest hover:text-forest";

export function ProductSectionEditButton({
  section,
  label = "Edit",
  product,
  suppliers,
  facilities,
  countries,
}: {
  section: Exclude<ProductFormSection, "all">;
  label?: string;
  product: ProductRow;
  suppliers: SupplierOption[];
  facilities: FacilityOption[];
  countries: CountryOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        <Edit2 className="h-3.5 w-3.5" />
        {label}
      </button>
      {open && (
        <AddProductForm
          product={product}
          show={section}
          suppliers={suppliers}
          facilities={facilities}
          countries={countries}
          canManageExporters={false}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function ProductImportStatus({
  product,
  canEdit,
}: {
  product: { id: string; product_name: string; lifecycle: ProductLifecycle; discontinued_on: string | null };
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <StatusBadge tone={lifecycleTone(product.lifecycle)}>{LIFECYCLE_LABEL[product.lifecycle]}</StatusBadge>
      {canEdit && (
        <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
          Change
        </button>
      )}
      {open && <ProductLifecycleDialog product={product} onClose={() => setOpen(false)} />}
    </div>
  );
}

function optionLabel(options: Array<{ value: string; label: string }>, value: string | null): string {
  if (!value) return "Not set";
  return options.find((option) => option.value === value)?.label ?? value.replace(/_/g, " ");
}

export function ProductCompositionFacts({ product }: { product: ProductRow }) {
  const facts = [
    { label: "Intended use", value: optionLabel(INTENDED_USES, product.intended_use) },
    { label: "Processing state", value: optionLabel(PROCESSING_STATES, product.raw_or_processed) },
    { label: "Allergens", value: product.allergen_information ?? "None declared" },
    { label: "Ingredients", value: product.ingredient_list ?? "Not recorded" },
  ];
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{fact.label}</dt>
          <dd className="mt-1 font-medium text-ink">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
