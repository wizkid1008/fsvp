export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-16 text-black md:px-8">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/15 border-t-black" />
        <p className="text-xs font-black uppercase tracking-[0.14em] text-black/50">Loading</p>
      </div>
    </main>
  );
}
