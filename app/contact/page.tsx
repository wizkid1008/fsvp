import Link from "next/link";

export const runtime = "edge";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-white px-5 py-16 text-black md:px-8">
      <section className="mx-auto max-w-6xl">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-black/50">Contact</p>
        <h1 className="mt-6 max-w-4xl text-6xl font-normal leading-[0.95] tracking-[-0.05em] md:text-8xl">
          Connect supplier onboarding and review support.
        </h1>
        <p className="mt-8 max-w-3xl text-lg leading-8 text-black/60">
          Configure this page with your support mailbox, reviewer intake address, and supplier onboarding contact once the
          deployment organization is finalized.
        </p>
        <Link href="/" className="mt-8 inline-flex h-14 items-center bg-black px-7 text-sm font-black uppercase tracking-[0.04em] text-white hover:bg-neutral-800">
          Back home
        </Link>
      </section>
    </main>
  );
}
