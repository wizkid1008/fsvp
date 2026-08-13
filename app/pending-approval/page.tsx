"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { SUPPORT_EMAIL } from "@/lib/constants";

export const runtime = "edge";

// What happens after approval, so the wait has a shape. These mirror the first
// steps of the canonical setup path in lib/setup/fsvp-workflow.ts.
const WHAT_HAPPENS_NEXT = [
  "An administrator confirms your U.S. importing entity and activates your account.",
  "You link or create the exporters you import from, then their facilities and products.",
  "You determine FSVP applicability per product, then open and sign an FSVP record for each one that needs it.",
];

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
      <div className="w-full max-w-lg border border-black/10 bg-white p-6 shadow-soft">
        <h1 className="text-3xl font-normal leading-[0.95] tracking-[-0.045em] text-black">
          Account pending approval
        </h1>
        {/* Do NOT promise an email here. approve-importer sends none, and the
            app has no transactional email provider at all — the only mail this
            system sends is Supabase Auth's own verification and password reset.
            If that changes, change this copy with it. */}
        <p className="mt-4 text-base leading-7 text-black/60">
          Your importer account has been created. Importer accounts are approved by a platform
          administrator, usually within one business day. Nothing is needed from you in the
          meantime — but you will not be notified automatically, so try logging in again after
          a day. Once approved, you&apos;ll go straight to your dashboard.
        </p>

        <div className="mt-6 border-t border-black/10 pt-5">
          <p className="text-xs font-black uppercase tracking-[0.08em] text-black/40">
            What happens next
          </p>
          <ol className="mt-3 space-y-3">
            {WHAT_HAPPENS_NEXT.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-6 text-black/70">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center border border-black/20 text-[11px] font-black text-black/50">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <p className="mt-6 text-sm leading-6 text-black/60">
          Waiting longer than a business day, or need to correct something on your application?
          Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-black text-black underline-offset-4 hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
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
