import Link from "next/link";

export const runtime = "edge";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white px-5 py-16 text-black md:px-8">
      <section className="mx-auto max-w-6xl">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-black/50">Platform</p>
        {/* "Foreign Supplier Verification Program" is FDA's statutory name, so the
            heading keeps it. The body uses the app's own word for the company. */}
        <h1 className="mt-6 max-w-4xl text-6xl font-normal leading-[0.95] tracking-[-0.05em] md:text-8xl">
          Built for Foreign Supplier Verification Program workflows.
        </h1>
        <p className="mt-8 max-w-3xl text-lg leading-8 text-black/60">
          ThrushCross Verify centralizes exporter records, product evidence, facility information, document review,
          readiness assessment, and reporting for teams preparing FSVP support materials. FDA&apos;s regulations call
          the company you import from a foreign supplier; the platform calls it an exporter, and cites
          21 CFR Part 1 Subpart L throughout.
        </p>
        <Link href="/" className="mt-8 inline-flex h-14 items-center bg-black px-7 text-sm font-black uppercase tracking-[0.04em] text-white hover:bg-neutral-800">
          Back home
        </Link>
      </section>
    </main>
  );
}
