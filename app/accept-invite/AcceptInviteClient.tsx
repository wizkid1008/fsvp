"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Building2 } from "lucide-react";

export function AcceptInviteClient({
  token,
  exporterName,
  supplierName,
  valid,
}: {
  token: string;
  exporterName: string;
  supplierName: string;
  valid: boolean;
}) {
  const router = useRouter();
  const [result, setResult] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function respond(decline: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/supplier-links/accept", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ token, decline }),
        });
        const json = await res.json() as { error?: string; declined?: boolean };
        if (!res.ok || json.error) throw new Error(json.error ?? "Request failed.");
        setResult(json.declined ? "declined" : "accepted");
        if (!json.declined) {
          setTimeout(() => router.push("/dashboard"), 1500);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  if (!valid) {
    return (
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-8 text-center shadow-soft">
        <XCircle className="mx-auto h-10 w-10 text-red-400" />
        <h1 className="mt-4 text-lg font-semibold text-ink">Invite not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          This invite link is invalid or has already been used.
        </p>
      </div>
    );
  }

  if (result === "accepted") {
    return (
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-8 text-center shadow-soft">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h1 className="mt-4 text-lg font-semibold text-ink">You're linked!</h1>
        <p className="mt-2 text-sm text-slate-500">
          You are now connected to <strong>{exporterName}</strong>. Redirecting to your dashboard…
        </p>
      </div>
    );
  }

  if (result === "declined") {
    return (
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-8 text-center shadow-soft">
        <XCircle className="mx-auto h-10 w-10 text-slate-400" />
        <h1 className="mt-4 text-lg font-semibold text-ink">Invite declined</h1>
        <p className="mt-2 text-sm text-slate-500">
          You have declined the invite from <strong>{exporterName}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-lg border border-line bg-white shadow-soft">
      <div className="border-b border-line px-6 py-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <Building2 className="h-6 w-6 text-slate-600" />
        </div>
        <h1 className="mt-3 text-lg font-semibold text-ink">Supplier Invite</h1>
        <p className="mt-1 text-sm text-slate-500">
          <strong>{exporterName}</strong> has invited <strong>{supplierName}</strong> to join
          their supply chain on Thrushcross Verify.
        </p>
      </div>

      <div className="px-6 py-5 space-y-3">
        <p className="text-sm text-slate-600">
          By accepting, both parties will be able to view and upload compliance evidence for
          shared facilities and products.
        </p>

        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            disabled={pending}
            onClick={() => respond(true)}
            className="flex-1 h-10 rounded-md border border-line text-sm font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-60"
          >
            Decline
          </button>
          <button
            disabled={pending}
            onClick={() => respond(false)}
            className="flex-1 h-10 rounded-md bg-forest text-sm font-semibold text-white hover:bg-[#195f4d] transition disabled:opacity-60"
          >
            {pending ? "Processing…" : "Accept invite"}
          </button>
        </div>
      </div>
    </div>
  );
}
