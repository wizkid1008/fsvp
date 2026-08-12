"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, CheckCircle2, ArrowRight } from "lucide-react";
import { FSVP_SETUP_STEPS } from "@/lib/setup/fsvp-steps";
import type { AppRole } from "@/types/platform";

export type OnboardingStep = {
  title: string;
  description: string;
  cta: { label: string; href: string };
};

/**
 * Dismissal is remembered. It used to live in component state only, so a modal
 * shown whenever the account had no exporters reappeared on every single
 * dashboard load — "Skip for now" lasted until the next navigation.
 */
const DISMISSED_KEY = "fsvp.onboarding.dismissed";

function dismissedKeyFor(role: AppRole): string {
  return `${DISMISSED_KEY}.${role}`;
}

const SUPPLIER_STEPS: OnboardingStep[] = [
  { title: "Complete your profile", description: "Add your company name, contact details, and country so your importer can identify you.", cta: { label: "Go to Account", href: "/account" } },
  { title: "Add your facility", description: "Create the manufacturing or storage facility where your products are made or held.", cta: { label: "Add Facility", href: "/facilities" } },
  { title: "Add your products", description: "Create products under the facility that makes or stores them.", cta: { label: "Add Product", href: "/products" } },
  { title: "Upload your evidence", description: "Upload the documents your importer has requested, including COAs, certifications, and food safety plans.", cta: { label: "Upload Evidence", href: "/my-evidence" } },
  { title: "Track your readiness", description: "See which FSVP requirements your submitted evidence covers, and what is still outstanding.", cta: { label: "View My Readiness", href: "/my-readiness" } },
];

export function OnboardingModal({ role = "supplier", steps }: { role?: AppRole; steps?: OnboardingStep[] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Read on the client after mount: localStorage is unavailable during the
  // server render, and starting open would flash the modal before the stored
  // dismissal could be checked.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(dismissedKeyFor(role)) !== "1") setOpen(true);
    } catch {
      setOpen(true); // storage blocked (private mode, embedded webview) — show it
    }
  }, [role]);

  function dismiss() {
    setOpen(false);
    try {
      window.localStorage.setItem(dismissedKeyFor(role), "1");
    } catch {
      // A browser that refuses storage still gets the modal closed for this
      // page view; it will reappear next load, which beats not closing at all.
    }
  }

  if (!open) return null;

  // Importers get the canonical path itself rather than a parallel wizard.
  // Eleven steps do not fit a stepper, and a shortened retelling is exactly how
  // the old seven-step version drifted out of sync with what the app enforces.
  const isImporter = role === "us_importer" && !steps;

  if (isImporter) {
    return (
      <Shell onClose={dismiss} eyebrow="Getting Started" title="Your FSVP path">
        <p className="text-sm leading-6 text-slate-600">
          Eleven steps take one product from an exporter record to an inspection-ready package.
          You do not have to do them in one sitting — <strong>Complete FSVP Setup</strong> tracks
          where you are and links each outstanding item to the screen that clears it.
        </p>

        <ol className="mt-5 max-h-64 space-y-2 overflow-y-auto pr-1">
          {FSVP_SETUP_STEPS.map((s, i) => (
            <li key={s.id} className="flex gap-3">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-[10px] font-bold text-slate-500">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{s.title}</p>
                <p className="text-xs leading-5 text-slate-500">{s.description}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button onClick={dismiss} className="text-sm text-slate-400 transition hover:text-slate-600">
            Skip for now
          </button>
          <Link
            href="/setup/fsvp"
            onClick={dismiss}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d]"
          >
            Open setup path
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Shell>
    );
  }

  const STEPS = steps && steps.length > 0 ? steps : SUPPLIER_STEPS;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <Shell
      onClose={dismiss}
      eyebrow={`Getting Started - Step ${step + 1} of ${STEPS.length}`}
      title={current.title}
    >
      <p className="text-sm leading-6 text-slate-600">{current.description}</p>

      <div className="mt-6 flex gap-1.5">
        {STEPS.map((_, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            aria-label={`Go to step ${i + 1}`}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-forest" : "bg-slate-200"}`}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button onClick={dismiss} className="text-sm text-slate-400 transition hover:text-slate-600">
          Skip for now
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="h-10 rounded-md border border-line px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Back
            </button>
          )}
          <Link
            href={current.cta.href}
            onClick={dismiss}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d]"
          >
            {current.cta.label}
            {isLast ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
          </Link>
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  onClose,
  eyebrow,
  title,
  children,
}: {
  onClose: () => void;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{eyebrow}</p>
            <h2 className="mt-0.5 text-lg font-semibold text-ink">{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 transition hover:bg-slate-100">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}
