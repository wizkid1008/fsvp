"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function ResetSessionBridge() {
  const [message, setMessage] = useState("Checking recovery link...");

  useEffect(() => {
    async function establishRecoverySession() {
      const supabase = createBrowserSupabaseClient();

      // PKCE flow: Supabase redirects with ?code=
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        window.history.replaceState(null, "", window.location.pathname);
        setMessage(error ? "Recovery session could not be created. Request a new password reset link." : "Recovery link verified. Enter your new password.");
        return;
      }

      // Implicit flow: Supabase redirects with #access_token=&refresh_token=
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        window.history.replaceState(null, "", window.location.pathname);
        setMessage(error ? "Recovery session could not be created. Request a new password reset link." : "Recovery link verified. Enter your new password.");
        return;
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();

      setMessage(session ? "Recovery link verified. Enter your new password." : "Open the latest password reset link from your email before updating your password.");
    }

    void establishRecoverySession();
  }, []);

  return <p className="mb-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">{message}</p>;
}
