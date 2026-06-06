"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function ResetSessionBridge() {
  const [message, setMessage] = useState("Checking recovery link...");

  useEffect(() => {
    async function checkSession() {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      setMessage(
        session
          ? "Recovery link verified. Enter your new password."
          : "Open the latest password reset link from your email before updating your password."
      );
    }

    void checkSession();
  }, []);

  return <p className="mb-4 rounded-md bg-slate-50 p-3 text-sm text-slate-600">{message}</p>;
}
