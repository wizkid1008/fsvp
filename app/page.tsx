import Link from "next/link";
import { ClipboardCheck, FileArchive, Gauge, ShieldCheck } from "lucide-react";
import { APP_NAME, LEGAL_DISCLAIMER } from "@/lib/constants";

const capabilities = [
  { icon: FileArchive, title: "Document evidence", text: "Upload, version, classify, review, and retain supplier compliance records." },
  { icon: Gauge, title: "Readiness scoring", text: "Track category scores, open gaps, recommendations, and supplier readiness status." },
  { icon: ClipboardCheck, title: "Reviewer workflows", text: "Route submissions through draft, submitted, under review, revision required, and approved states." },
  { icon: ShieldCheck, title: "RLS security", text: "Use Supabase Auth, role-based permissions, storage controls, and audit logging." }
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="border-b border-line bg-panel">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-forest">Supabase + Cloudflare Pages</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-normal text-ink md:text-5xl">{APP_NAME}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              A secure workspace for foreign suppliers, importers, consultants, auditors, and administrators to manage
              FSVP documentation, review activity, readiness scoring, reports, and notifications.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-md bg-forest px-5 py-3 text-sm font-semibold text-white hover:bg-[#195f4d]">
                Create account
              </Link>
              <Link href="/login" className="rounded-md border border-line bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Log in
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <div className="grid gap-3">
              {["Supplier Identity", "Product Information", "Hazard Analysis", "Verification Activities", "Recall Preparedness"].map((item, index) => (
                <div key={item} className="rounded-md border border-line p-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold text-ink">{item}</span>
                    <span className="text-sm text-slate-500">{82 - index * 5}%</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-forest" style={{ width: `${82 - index * 5}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-10 md:grid-cols-2 lg:grid-cols-4">
        {capabilities.map((item) => (
          <article key={item.title} className="rounded-lg border border-line bg-white p-5">
            <item.icon className="h-5 w-5 text-forest" />
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
