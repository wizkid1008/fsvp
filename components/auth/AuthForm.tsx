"use client";

import { useState, useTransition } from "react";
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

const VERIFICATION_HELP_MESSAGE =
  "If there is an account with this email address, you can request a verification email.";

export function AuthForm({ mode, nextPath = "/dashboard" }: { mode: AuthMode; nextPath?: string }) {
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
        const emailValue = email.trim();
        const passwordValue = password.trim();

        if (mode === "login") {
          const { error: authError } = await supabase.auth.signInWithPassword({ email: emailValue, password: passwordValue });
          if (authError) throw authError;
          window.location.assign(nextPath);
        }

        if (mode === "signup") {
          const { data, error: authError } = await supabase.auth.signUp({
            email: emailValue,
            password: passwordValue,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/verified` }
          });
          const accountAlreadyExists = data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
          if (accountAlreadyExists) {
            setMessage(VERIFICATION_HELP_MESSAGE);
            return;
          }
          if (authError) throw authError;
          setMessage(VERIFICATION_HELP_MESSAGE);
        }

        if (mode === "forgot") {
          const { error: authError } = await supabase.auth.resetPasswordForEmail(emailValue, {
            redirectTo: `${window.location.origin}/reset-password`
          });
          if (authError) throw authError;
          setMessage("Password reset email sent. If it does not arrive, check spam and confirm the address is registered.");
        }

        if (mode === "reset") {
          const { error: authError } = await supabase.auth.updateUser({ password: passwordValue });
          if (authError) throw authError;
          window.location.assign("/dashboard");
        }
      } catch (authError) {
        const message = authError instanceof Error ? authError.message : "Authentication failed.";
        if (mode === "signup" && message.toLowerCase().includes("already")) {
          setMessage(VERIFICATION_HELP_MESSAGE);
          return;
        }

        setError(
          message === "Failed to fetch"
            ? "Could not reach Supabase. Check the Cloudflare Supabase URL/key values and redeploy."
            : message.toLowerCase().includes("email not confirmed")
              ? "Please verify your email before logging in. Check your inbox for the Supabase confirmation link."
            : message
        );
      }
    });
  }

  function resendVerification() {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const emailValue = email.trim();
        const { error: resendError } = await supabase.auth.resend({
          type: "signup",
          email: emailValue,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/verified` }
        });
        if (resendError) throw resendError;
        setMessage("Verification email requested. Check inbox, spam, and any mail filters.");
      } catch (resendError) {
        setError(resendError instanceof Error ? resendError.message : "Could not resend verification email.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md border border-black/10 bg-white p-6 shadow-soft">
      <h1 className="text-5xl font-normal leading-[0.95] tracking-[-0.045em] text-black">{copy[mode].title}</h1>
      <p className="mt-4 text-base leading-7 text-black/60">{copy[mode].helper}</p>
      {mode !== "reset" ? (
        <label className="mt-6 block text-sm font-bold text-black">
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            className="mt-2 h-12 w-full border border-black/15 px-3 outline-none focus:border-black"
          />
        </label>
      ) : null}
      {mode !== "forgot" ? (
        <label className="mt-4 block text-sm font-bold text-black">
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
            minLength={8}
            className="mt-2 h-12 w-full border border-black/15 px-3 outline-none focus:border-black"
          />
        </label>
      ) : null}
      <button
        disabled={pending}
        className="mt-6 h-12 w-full bg-black px-4 text-sm font-black uppercase tracking-[0.04em] text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Working..." : copy[mode].button}
      </button>
      {message ? <p className="mt-4 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {mode === "signup" && email.trim() ? (
        <button
          type="button"
          onClick={resendVerification}
          disabled={pending}
          className="mt-4 text-sm font-black uppercase tracking-[0.04em] text-black underline-offset-4 hover:underline disabled:opacity-60"
        >
          Resend verification email
        </button>
      ) : null}
    </form>
  );
}
