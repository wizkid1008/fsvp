"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type AuthMode = "login" | "signup" | "forgot" | "reset";

const copy: Record<AuthMode, { title: string; button: string; helper: string }> = {
  login: {
    title: "Log in",
    button: "Log in",
    helper: "Access supplier readiness, reviewer queues, and document workflows."
  },
  signup: {
    title: "Create account",
    button: "Create account",
    helper: "Email verification is handled by Supabase before protected access is granted."
  },
  forgot: {
    title: "Reset password",
    button: "Send reset email",
    helper: "Enter your email and Supabase will send a secure password reset link."
  },
  reset: {
    title: "Set new password",
    button: "Update password",
    helper: "Choose a new password for your current recovery session."
  }
};

export function AuthForm({ mode, nextPath = "/dashboard" }: { mode: AuthMode; nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient();

        if (mode === "login") {
          const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
          if (authError) throw authError;
          router.push(nextPath);
        }

        if (mode === "signup") {
          const { error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
          });
          if (authError) throw authError;
          setMessage("Check your email to verify the account before signing in.");
        }

        if (mode === "forgot") {
          const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`
          });
          if (authError) throw authError;
          setMessage("Password reset email sent.");
        }

        if (mode === "reset") {
          const { error: authError } = await supabase.auth.updateUser({ password });
          if (authError) throw authError;
          router.push("/dashboard");
        }
      } catch (authError) {
        setError(authError instanceof Error ? authError.message : "Authentication failed.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-line bg-white p-6 shadow-soft">
      <h1 className="text-2xl font-semibold text-ink">{copy[mode].title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{copy[mode].helper}</p>
      {mode !== "reset" ? (
        <label className="mt-6 block text-sm font-medium text-slate-700">
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            className="mt-2 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-forest"
          />
        </label>
      ) : null}
      {mode !== "forgot" ? (
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
            minLength={8}
            className="mt-2 h-11 w-full rounded-md border border-line px-3 outline-none focus:border-forest"
          />
        </label>
      ) : null}
      <button
        disabled={pending}
        className="mt-6 h-11 w-full rounded-md bg-forest px-4 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Working..." : copy[mode].button}
      </button>
      {message ? <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
