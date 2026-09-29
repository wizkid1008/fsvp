"use client";

import { useState } from "react";
import { Edit2, Plus } from "lucide-react";
import { CreateExporterForm, type EditableExporter } from "@/components/suppliers/CreateExporterForm";
import { AddSupplierForm, type EditableSupplier } from "@/components/suppliers/AddSupplierForm";
import { AddFacilityForm, type FacilityRow } from "@/components/facilities/FacilityTable";
import { AddProductForm, type FacilityOption } from "@/components/products/ProductTable";
import type { Country } from "@/types/database";

/**
 * The actions an exporter or facility page offers, as the product page does:
 * Edit on the Details section, "+ Add" on the list of what it contains. They
 * open the same forms the list pages used, so there is one form per entity
 * wherever it is opened from.
 */

type CountryOption = Pick<Country, "country_code" | "country_name">;

export const detailButtonClass =
  "inline-flex h-8 items-center gap-1 rounded-md border border-line px-2.5 text-xs font-semibold text-slate-600 transition hover:border-forest hover:text-forest disabled:cursor-not-allowed disabled:opacity-40";

/**
 * An importer edits an exporter record it manages through CreateExporterForm;
 * a platform user edits any supplier through AddSupplierForm — the same split
 * the Exporters list made. `blockedReason` explains a refusal instead of
 * hiding the button.
 */
export function ExporterEditButton({
  exporter,
  countries,
  asImporter,
  blockedReason = null,
}: {
  exporter: EditableExporter & EditableSupplier;
  countries: CountryOption[];
  asImporter: boolean;
  blockedReason?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={Boolean(blockedReason)}
        title={blockedReason ?? `Edit ${exporter.company_name}`}
        className={detailButtonClass}
      >
        <Edit2 className="h-3.5 w-3.5" />
        Edit
      </button>
      {open && (asImporter
        ? <CreateExporterForm countries={countries} exporter={exporter} onClose={() => setOpen(false)} />
        : <AddSupplierForm countries={countries} supplier={exporter} onClose={() => setOpen(false)} />)}
    </>
  );
}

export function FacilityEditButton({
  facility,
  supplier,
  countries,
}: {
  facility: FacilityRow;
  supplier: { id: string; company_name: string };
  countries: CountryOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={detailButtonClass}>
        <Edit2 className="h-3.5 w-3.5" />
        Edit
      </button>
      {open && (
        <AddFacilityForm countries={countries} facility={facility} suppliers={[supplier]} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export function AddFacilityButton({
  supplier,
  countries,
}: {
  supplier: { id: string; company_name: string };
  countries: CountryOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={detailButtonClass}>
        <Plus className="h-3.5 w-3.5" />
        Add facility
      </button>
      {open && (
        <AddFacilityForm
          countries={countries}
          suppliers={[supplier]}
          presetSupplierId={supplier.id}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** The short "Add product" — basics only, then onto the new product's page. */
export function AddProductButton({
  supplier,
  facilities,
  presetFacilityId = null,
  countries,
}: {
  supplier: { id: string; company_name: string };
  facilities: FacilityOption[];
  presetFacilityId?: string | null;
  countries: CountryOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={detailButtonClass}>
        <Plus className="h-3.5 w-3.5" />
        Add product
      </button>
      {open && (
        <AddProductForm
          countries={countries}
          suppliers={[supplier]}
          facilities={facilities}
          presetFacility={presetFacilityId ? { facilityId: presetFacilityId, supplierId: supplier.id } : null}
          canManageExporters={false}
          show="basics"
          openAfterCreate
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
