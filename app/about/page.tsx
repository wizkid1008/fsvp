import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <h1 className="text-3xl font-semibold text-ink">About</h1>
      <p className="mt-4 text-base leading-7 text-slate-600">
        FSVP Compliance Platform centralizes supplier records, product evidence, facility information, document review,
        readiness assessment, and reporting for teams preparing FSVP support materials.
      </p>
      <Link href="/" className="mt-8 inline-flex rounded-md border border-line px-4 py-2 text-sm font-semibold text-slate-700">
        Back home
      </Link>
    </main>
  );
}
