"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  target_url: string | null;
  created_at: string;
  read_at: string | null;
};

export function NotificationsList({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function markRead(id?: string) {
    setError(null);
    const res = await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    });
    if (!res.ok) {
      setError("Couldn't update notification status. Please try again.");
      return;
    }
    startTransition(() => router.refresh());
  }

  if (notifications.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-white px-5 py-10 text-center shadow-soft">
        <span className="mx-auto grid h-10 w-10 place-items-center rounded-md bg-sky-50 text-[#0A2540]">
          <Bell className="h-4 w-4" />
        </span>
        <p className="mt-3 text-base font-semibold text-ink">No notifications yet</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Certificate expirations, review requests, and approval notices will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={isPending}
            onClick={() => markRead()}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-slate-700 shadow-soft hover:bg-slate-50 disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </button>
        </div>
      )}

      <div className="divide-y divide-line rounded-lg border border-line bg-white shadow-soft">
        {notifications.map((n) => {
          const content = (
            <div className="flex items-start gap-3 px-5 py-4">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-sky-50 text-[#0A2540]">
                <Bell className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{n.title}</p>
                {n.body && <p className="mt-1 text-sm text-slate-500">{n.body}</p>}
                <p className="mt-1 text-xs text-slate-400">{new Date(n.created_at).toLocaleString()}</p>
              </div>
              <StatusBadge tone={n.read_at ? "neutral" : "warning"}>{n.read_at ? "Read" : "New"}</StatusBadge>
            </div>
          );

          return (
            <div key={n.id} className="hover:bg-slate-50" onClick={() => !n.read_at && markRead(n.id)}>
              {n.target_url ? <Link href={n.target_url}>{content}</Link> : content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
