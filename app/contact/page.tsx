import Link from "next/link";

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <h1 className="text-3xl font-semibold text-ink">Contact</h1>
      <p className="mt-4 text-base leading-7 text-slate-600">
        Configure this page with your support mailbox, reviewer intake address, and supplier onboarding contact once the
        deployment organization is finalized.
      </p>
      <Link href="/" className="mt-8 inline-flex rounded-md border border-line px-4 py-2 text-sm font-semibold text-slate-700">
        Back home
      </Link>
    </main>
  );
}
