"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-16 text-black md:px-8">
      <section className="mx-auto max-w-xl text-center">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-black/50">Error</p>
        <h1 className="mt-6 text-4xl font-normal leading-[0.95] tracking-[-0.05em] md:text-5xl">
          Something went wrong.
        </h1>
        <p className="mt-6 text-base leading-7 text-black/60">
          The page hit an unexpected error and couldn&apos;t load. Nothing was recorded, and no action was
          submitted. Try again, or return to the dashboard.
        </p>
        {error.digest && (
          <p className="mt-4 text-xs text-black/40">Reference: {error.digest}</p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-12 items-center bg-black px-6 text-sm font-black uppercase tracking-[0.04em] text-white hover:bg-neutral-800"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-12 items-center border border-black px-6 text-sm font-black uppercase tracking-[0.04em] text-black hover:bg-black/5"
          >
            Back to dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
