import Image from "next/image";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";

export const runtime = "edge";
import { APP_NAME, APP_SUBTITLE, LEGAL_DISCLAIMER, PARENT_BRAND } from "@/lib/constants";

const proofPoints = [
  {
    title: "Assess in minutes",
    text: "Capture supplier, commodity, origin, hazard, evidence, and review status in one workspace."
  },
  {
    title: "Control your evidence",
    text: "Map each file to FSVP requirements and keep reviewer comments close to the record."
  },
  {
    title: "Prepare for inspection",
    text: "Build a clean readiness view with open gaps, corrective actions, and export-ready reports."
  }
];

const stats = [
  { value: "100", label: "Point readiness model" },
  { value: "21 CFR", label: "Requirement mapping" },
  { value: "2", label: "Private evidence libraries" }
];

const featureColumns = [
  {
    eyebrow: "SUPPLIER REVIEW",
    items: ["Supplier records", "Foreign facility profiles", "Product and commodity files", "Written assurances"]
  },
  {
    eyebrow: "RISK WORK",
    items: ["Commodity hazard prompts", "Country and origin context", "Allergen and recall tracking", "Corrective actions"]
  },
  {
    eyebrow: "AUDIT TRAIL",
    items: ["Document versions", "Reviewer decisions", "Readiness reports", "Role-based access"]
  }
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-black">
      <section className="grid min-h-[calc(100vh-72px)] gap-8 px-5 py-10 md:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12 lg:py-12">
        <div className="flex max-w-3xl flex-col justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-black/55">{APP_NAME} / {APP_SUBTITLE}</p>
            <h1 className="mt-8 max-w-3xl text-[clamp(4rem,8vw,8.25rem)] font-normal leading-[0.93] tracking-[-0.055em]">
              Verify imported food suppliers with confidence.
            </h1>
          </div>

          <div className="mt-10 max-w-2xl">
            <div className="space-y-7">
              {proofPoints.map((point) => (
                <div key={point.title} className="flex gap-4">
                  <Check className="mt-1 h-4 w-4 shrink-0" strokeWidth={3} />
                  <div>
                    <h2 className="text-sm font-black">{point.title}</h2>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-black/55">{point.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-5">
              <Link href="/dashboard" className="inline-flex h-16 items-center bg-black px-8 text-sm font-black uppercase tracking-[0.04em] text-white hover:bg-neutral-800">
                Start review
              </Link>
              <p className="max-w-[220px] text-xs font-medium leading-5 text-black/55">
                No public data sharing. Supabase Auth and role-based access keep records private.
              </p>
            </div>
          </div>
        </div>

        <div className="relative min-h-[420px] overflow-hidden rounded-md bg-neutral-100 lg:min-h-0">
          <Image
            src="/images/thrushcross-verify-hero.png"
            alt="Laptop showing a supplier verification dashboard with imported food commodities and compliance records"
            fill
            priority
            sizes="(min-width: 1024px) 52vw, 100vw"
            className="object-cover object-center"
          />
        </div>
      </section>

      <section className="grid gap-8 border-y border-black/10 px-5 py-12 md:grid-cols-3 md:px-8">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="text-5xl font-normal tracking-[-0.04em]">{stat.value}</p>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.06em] text-black/50">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-0 bg-black px-5 py-12 text-white md:grid-cols-[0.9fr_1.1fr] md:px-8 md:py-20">
        <div className="max-w-xl">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">BUILT FOR FSVP TEAMS</p>
          <h2 className="mt-5 text-5xl font-normal leading-[0.98] tracking-[-0.045em] md:text-7xl">
            Every requirement, review, and record in one place.
          </h2>
        </div>
        <div className="mt-10 grid gap-8 md:mt-0 md:grid-cols-3">
          {featureColumns.map((column) => (
            <div key={column.eyebrow}>
              <p className="mb-5 text-[11px] font-black uppercase tracking-[0.08em] text-white/40">{column.eyebrow}</p>
              <div className="space-y-3">
                {column.items.map((item) => (
                  <p key={item} className="text-sm font-bold text-white/90">{item}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-5 px-5 py-8 text-xs leading-5 text-black/50 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-2 font-black uppercase tracking-[0.08em] text-black">
          <ShieldCheck className="h-4 w-4" />
          {PARENT_BRAND}
        </div>
        <p className="max-w-3xl">{LEGAL_DISCLAIMER}</p>
      </section>
    </main>
  );
}
