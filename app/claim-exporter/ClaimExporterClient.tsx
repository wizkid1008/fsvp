"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Building2, CheckCircle2, FileArchive, PackageSearch } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type ClaimInfo = {
  supplier: {
    id: string;
    company_name: string;
    legal_entity_name: string | null;
    country: string;
    record_mode: string;
    contact_email: string | null;
  };
  importer_name: string | null;
  documents: number;
  products: number;
};

export function ClaimExporterClient({ token }: { token: string }) {
  const [info, setInfo]       = useState<ClaimInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [done, setDone]       = useState<"accepted" | "declined" | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!token) {
      setError("No invite token in the link.");
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();
        setSignedIn(!!session);

        const res  = await fetch(`/api/exporters/claim?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error ?? "Could not load this invite.");
        setInfo(json as ClaimInfo);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load this invite.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  function respond(decline: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const res  = await fetch("/api/exporters/claim", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ token, decline }),
        });
        const json = await res.json() as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error ?? "Could not complete that.");
        setDone(decline ? "declined" : "accepted");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-5 py-12">
      <div className="rounded-lg border border-line bg-white p-8 shadow-soft">{children}</div>
    </main>
  );

  if (loading) return shell(<p className="text-sm text-slate-500">Loading invite…</p>);

  if (error && !info) {
    return shell(
      <>
        <h1 className="text-xl font-semibold text-ink">Invite unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-forest hover:underline">
          Back to home
        </Link>
      </>
    );
  }

  if (done === "accepted") {
    return shell(
      <>
        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        <h1 className="mt-3 text-xl font-semibold text-ink">
          {info?.supplier.company_name} is yours
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          You now maintain this company profile and can upload evidence directly. Everything{" "}
          {info?.importer_name ?? "your importer"} already uploaded on your behalf stays in place.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d]"
        >
          Go to your dashboard
        </Link>
      </>
    );
  }

  if (done === "declined") {
    return shell(
      <>
        <h1 className="text-xl font-semibold text-ink">Invitation declined</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {info?.importer_name ?? "The importer"} keeps managing this record. You can accept later
          if they send another invitation.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm font-semibold text-forest hover:underline">
          Back to home
        </Link>
      </>
    );
  }

  const s = info!.supplier;

  return shell(
    <>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
        <Building2 className="h-3.5 w-3.5" />
        Company record invitation
      </div>

      <h1 className="mt-3 text-2xl font-semibold text-ink">{s.company_name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {s.legal_entity_name && s.legal_entity_name !== s.company_name
          ? `${s.legal_entity_name} · ${s.country}`
          : s.country}
      </p>

      <p className="mt-5 text-sm leading-6 text-slate-600">
        <span className="font-semibold text-ink">{info!.importer_name ?? "A U.S. importer"}</span>{" "}
        created this record for your company so they could meet their FSVP obligations, and has
        invited you to take it over.
      </p>

      {(info!.documents > 0 || info!.products > 0) && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-md border border-line bg-slate-50 px-4 py-3">
            <FileArchive className="h-4 w-4 text-slate-400" />
            <div>
              <p className="text-sm font-semibold text-ink">{info!.documents}</p>
              <p className="text-xs text-slate-500">documents already on file</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-line bg-slate-50 px-4 py-3">
            <PackageSearch className="h-4 w-4 text-slate-400" />
            <div>
              <p className="text-sm font-semibold text-ink">{info!.products}</p>
              <p className="text-xs text-slate-500">products recorded</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 rounded-md border border-line bg-white p-4">
        <p className="text-sm font-semibold text-ink">If you accept</p>
        <ul className="mt-2 space-y-1.5 text-sm leading-6 text-slate-600">
          <li>· You maintain your own company profile from then on.</li>
          <li>· You upload evidence directly instead of emailing it.</li>
          <li>· The importer keeps the trading relationship and everything already uploaded.</li>
          <li>· Nothing already on file is deleted or rewritten.</li>
        </ul>
      </div>

      {!signedIn && (
        <p className="mt-5 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Sign in or create your account first, then return to this link to accept.
        </p>
      )}

      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        {signedIn ? (
          <>
            <button
              onClick={() => respond(false)}
              disabled={pending}
              className="inline-flex h-10 items-center rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d] disabled:opacity-60"
            >
              {pending ? "Working…" : "Accept and take over this record"}
            </button>
            <button
              onClick={() => respond(true)}
              disabled={pending}
              className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Decline
            </button>
          </>
        ) : (
          <>
            <Link
              href={`/login?next=${encodeURIComponent(`/claim-exporter?token=${token}`)}`}
              className="inline-flex h-10 items-center rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d]"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Create an account
            </Link>
          </>
        )}
      </div>
    </>
  );
}
