import Link from "next/link";

export const runtime = "edge";

export default function VerifiedPage() {
  return (
    <main className="min-h-screen bg-white px-5 py-16 text-black">
      <section className="mx-auto max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-black/50">Account verified</p>
        <h1 className="mt-6 text-6xl font-normal leading-[0.95] tracking-[-0.05em] md:text-8xl">
          Thank you for verifying your account.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-black/60">
          Your email has been confirmed. You can now sign in and continue setting up your ThrushCross Verify workspace.
        </p>
        <Link href="/login" className="mt-8 inline-flex h-14 items-center bg-black px-7 text-sm font-black uppercase tracking-[0.04em] text-white hover:bg-neutral-800">
          Continue to sign in
        </Link>
      </section>
    </main>
  );
}
