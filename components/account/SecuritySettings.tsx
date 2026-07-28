"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function SecuritySettings({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendResetEmail() {
    setSending(true);
    setMessage(null);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (authError) throw authError;
      setMessage("Password reset email sent. Check your inbox (and spam folder).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
      <h2 className="text-base font-semibold text-ink">Password</h2>
      <p className="mt-1 text-sm text-slate-500">
        Send yourself a secure link to set a new password for {email}.
      </p>
      {message && <p className="mt-3 rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-700">{message}</p>}
      {error && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
      <button
        type="button"
        disabled={sending}
        onClick={sendResetEmail}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-forest px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#195f4d] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? "Sending…" : "Send password reset email"}
      </button>
    </div>
  );
}
