import Link from "next/link";

export const runtime = "edge";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5">
      <div className="text-center">
        <p className="text-sm font-black uppercase tracking-widest text-black/40">404</p>
        <h1 className="mt-4 text-4xl font-semibold text-black">Page not found</h1>
        <p className="mt-4 text-sm text-black/50">The page you are looking for does not exist.</p>
        <Link href="/" className="mt-8 inline-flex h-10 items-center rounded-md bg-black px-5 text-sm font-semibold text-white hover:bg-black/80 transition">
          Go home
        </Link>
      </div>
    </main>
  );
}
