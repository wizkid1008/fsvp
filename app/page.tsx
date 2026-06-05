import Link from "next/link";
import { AlertTriangle, ClipboardCheck, FileArchive, FileSearch, Gauge, ShieldCheck } from "lucide-react";
import { APP_NAME, APP_SUBTITLE, BRAND_TAGLINE, LEGAL_DISCLAIMER, PARENT_BRAND } from "@/lib/constants";

const capabilities = [
  { icon: AlertTriangle, title: "Commodity risk engine", text: "Ask commodity, origin, processing state, intended use, hazard, certification, allergen, and recall questions." },
  { icon: FileSearch, title: "Requirement mapping", text: "Connect each document to the FSVP requirement it supports, with reviewer status and gap resolution." },
  { icon: Gauge, title: "Readiness scoring", text: "Calculate a defensible 100-point readiness score with critical gaps and next actions." },
  { icon: ClipboardCheck, title: "Reviewer workflows", text: "Accept, reject, comment, request revisions, create corrective actions, and approve reports." },
  { icon: FileArchive, title: "Audit-ready records", text: "Preserve document versions, access logs, review history, and readiness reports." },
  { icon: ShieldCheck, title: "Secure by role", text: "Use Supabase Auth, protected routes, row-level security, storage controls, and audit logs." }
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="border-b border-line bg-panel">
        <div className="mx-auto max-w-7xl px-5 py-14">
          <div className="max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-sky-600">{APP_NAME} • {BRAND_TAGLINE}</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-normal text-ink md:text-6xl">
              FSVP supplier verification for agricultural commodity imports into the United States.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              ThrushCross Verify helps importers and foreign suppliers organize documentation, assess commodity risk,
              identify compliance gaps, and prepare audit-ready FSVP records.
            </p>
            <p className="mt-3 text-sm font-semibold text-slate-500">{APP_SUBTITLE} by {PARENT_BRAND}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-md bg-[#2DA8FF] px-5 py-3 text-sm font-semibold text-[#0A2540] hover:bg-sky-300">
                Start Supplier Review
              </Link>
              <Link href="/assessment" className="rounded-md border border-line bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                View FSVP Readiness Checklist
              </Link>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-10 md:grid-cols-2 lg:grid-cols-3">
        {capabilities.map((item) => (
          <article key={item.title} className="rounded-lg border border-line bg-white p-5">
            <item.icon className="h-5 w-5 text-[#2DA8FF]" />
            <h2 className="mt-4 text-base font-semibold text-ink">{item.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
          </article>
        ))}
      </section>
      <section className="border-t border-line bg-panel px-5 py-6 text-center text-xs leading-5 text-slate-500">
        {LEGAL_DISCLAIMER}
      </section>
    </main>
  );
}
