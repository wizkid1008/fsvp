"use client";

import { useState } from "react";
import Link from "next/link";
import { X, CheckCircle2, ArrowRight } from "lucide-react";
import type { AppRole } from "@/types/platform";

export type OnboardingStep = {
  title: string;
  description: string;
  cta: { label: string; href: string };
};

// Order follows the actual data dependencies: an FSVP record needs a supplier,
// a facility and a product to exist first, and a readiness assessment scores
// FSVP records. The previous sequence ended at "run an assessment" without ever
// mentioning FSVP records or the review queue, so a new importer's first
// assessment necessarily returned "No FSVP records found for this supplier."
const IMPORTER_STEPS: OnboardingStep[] = [
  { title: "Complete your profile", description: "Add your name and contact details. Your importing organization is set up by an administrator when your account is approved.", cta: { label: "Go to Account", href: "/account" } },
  { title: "Link or add an exporter", description: "Link an exporter who already has an account, or create the record yourself if they will not register — you can maintain it on their behalf.", cta: { label: "Go to Exporters", href: "/suppliers" } },
  { title: "Add their facility and product", description: "Record the facility where the food is produced and the product you import. An FSVP record is opened against one supplier, facility and product together.", cta: { label: "Add a Facility", href: "/facilities" } },
  { title: "Collect the evidence", description: "Upload COAs, audit reports, food safety plans and certifications — or ask the exporter to submit them directly if they have an account.", cta: { label: "Go to Evidence", href: "/evidence" } },
  { title: "Review what they submit", description: "Accept, request revisions on, or reject each document. Only accepted evidence counts toward a record.", cta: { label: "Open Review Queue", href: "/importer-review" } },
  { title: "Open an FSVP record", description: "Document your hazard analysis, supplier and facility evaluation, and verification determination for that supplier, facility and product.", cta: { label: "Create FSVP Record", href: "/fsvp-records/new" } },
  { title: "Approve and monitor", description: "Record your approval decision, then track reassessment dates, expiring certificates and corrective actions.", cta: { label: "View FSVP Records", href: "/fsvp-records" } },
];

const SUPPLIER_STEPS = [
  { title: "Complete your profile", description: "Add your company name, contact details, and country so your importer can identify you.", cta: { label: "Go to Account", href: "/account" } },
  { title: "Add your facility", description: "Create the manufacturing or storage facility where your products are made or held.", cta: { label: "Add Facility", href: "/facilities" } },
  { title: "Add your products", description: "Create products under the supplier facility that makes or stores them.", cta: { label: "Add Product", href: "/products" } },
  { title: "Upload your evidence", description: "Upload the documents your importer has requested, including COAs, certifications, and food safety plans.", cta: { label: "Upload Evidence", href: "/my-evidence" } },
  { title: "Review your action items", description: "Check for any corrective actions, revision requests, or additional documents your importer has asked for.", cta: { label: "View Action Items", href: "/dashboard" } },
];

export function OnboardingModal({ role = "supplier", steps }: { role?: AppRole; steps?: OnboardingStep[] }) {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);

  const STEPS = steps && steps.length > 0 ? steps : role === "supplier" ? SUPPLIER_STEPS : IMPORTER_STEPS;
  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Getting Started - Step {step + 1} of {STEPS.length}</p>
            <h2 className="mt-0.5 text-lg font-semibold text-ink">{current.title}</h2>
          </div>
          <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-slate-100 transition">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="px-6 py-6">
          <p className="text-sm leading-6 text-slate-600">{current.description}</p>

          <div className="mt-6 flex gap-1.5">
            {STEPS.map((_, i) => (
              <button key={i} onClick={() => setStep(i)} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-forest" : "bg-slate-200"}`} />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button onClick={() => setOpen(false)} className="text-sm text-slate-400 hover:text-slate-600 transition">Skip for now</button>
            <div className="flex gap-2">
              {step > 0 && (
                <button onClick={() => setStep((s) => s - 1)} className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Back</button>
              )}
              <Link
                href={current.cta.href}
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-forest px-5 text-sm font-semibold text-white hover:bg-[#195f4d] transition"
              >
                {current.cta.label}
                {isLast ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
