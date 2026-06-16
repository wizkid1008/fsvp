"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export const runtime = "edge";

export default function PendingApprovalPage() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 py-12">
      <div className="w-full max-w-md border border-black/10 bg-white p-6 shadow-soft">
        <h1 className="text-3xl font-normal leading-[0.95] tracking-[-0.045em] text-black">
          Account pending approval
        </h1>
        <p className="mt-4 text-base leading-7 text-black/60">
          Your importer account has been created, but importer accounts must be approved by a
          platform administrator before you can access the platform. You'll be able to log in
          normally once approved — no action is needed from you in the meantime.
        </p>
        <button
          onClick={handleLogout}
          className="mt-6 h-12 w-full bg-black px-4 text-sm font-black uppercase tracking-[0.04em] text-white transition hover:bg-neutral-800"
        >
          Log out
        </button>
      </div>
    </main>
  );
}
