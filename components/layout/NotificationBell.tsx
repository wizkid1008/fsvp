"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/**
 * Unread notification count in the app header.
 *
 * Notifications used to be a sidebar item, competing for attention with real
 * workspaces like FSVP Records. It is not a place you go to work — it is a
 * signal — so it lives here and the page it links to stays where it was.
 *
 * The count query is served by ix_notifications_recipient on
 * (recipient_profile_id, read_at), which the baseline already created for
 * exactly this.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count } = await (supabase.from("app_notifications") as any)
        .select("id", { count: "exact", head: true })
        .eq("recipient_profile_id", user.id)
        .is("read_at", null);

      if (!cancelled) setUnread(count ?? 0);
    }

    void load();
    return () => { cancelled = true; };
    // Re-count on navigation: reading the notifications page marks rows read,
    // and any action that generates one is a navigation away from here.
  }, [pathname]);

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative grid h-9 w-9 place-items-center text-white/80 transition hover:text-white"
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-black text-black">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
