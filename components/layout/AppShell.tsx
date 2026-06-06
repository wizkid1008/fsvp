"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { APP_NAME, APP_SUBTITLE, BRAND_TAGLINE, LEGAL_DISCLAIMER, PARENT_BRAND } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { iconMap, navItems } from "@/data/platform";
import { RolePreviewBanner } from "@/components/admin/RolePreview";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { AppRole } from "@/types/platform";

const PREVIEW_KEY = "fsvp_preview_role";

const ROLE_LABELS: Record<AppRole, string> = {
  supplier: "Supplier",
  us_importer: "US Importer",
  reviewer: "Reviewer",
  administrator: "Administrator",
};

function initials(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function AppShell({
  children,
  role: serverRole = "supplier"
}: {
  children: React.ReactNode;
  role?: AppRole;
}) {
  const pathname = usePathname();
  const [role, setRole] = useState<AppRole>(serverRole);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState<string>("··");

  useEffect(() => {
    if (serverRole === "administrator") {
      const preview = localStorage.getItem(PREVIEW_KEY) as AppRole | null;
      if (preview) setRole(preview);
    }
  }, [serverRole]);

  useEffect(() => {
    async function loadUser() {
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await (supabase.from("profiles") as any)
        .select("full_name, organization_name")
        .eq("id", user.id)
        .maybeSingle();

      const name = profile?.full_name ?? null;
      const email = user.email ?? "";
      setUserInitials(initials(name, email));
      setDisplayName(name || email.split("@")[0]);
    }
    void loadUser();
  }, []);

  const { locale, t } = useLocale();
  const visibleItems = navItems.filter((item) => !item.roles || item.roles.includes(role));

  return (
    <div className="min-h-screen bg-white text-black">
      <aside className="fixed bottom-0 left-0 top-[72px] hidden w-72 overflow-y-auto border-r border-black/10 bg-white p-5 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center border border-black bg-black text-sm font-black text-white">TC</div>
          <div>
            <p className="text-sm font-black uppercase tracking-[0.06em] text-black">{APP_NAME}</p>
            <p className="text-xs text-black/50">by {PARENT_BRAND}</p>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-black/40">{BRAND_TAGLINE}</p>
          </div>
        </Link>
        <nav className="mt-8 space-y-1">
          {visibleItems.map((item) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap];
            const active = pathname === item.href || item.matches?.some((route) => pathname.startsWith(route));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-sm font-bold transition",
                  active ? "bg-black text-white" : "text-black/60 hover:bg-black/5 hover:text-black"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.tKey ? t(item.tKey) : item.label}
              </Link>
            );
          })}
        </nav>

        {/* User identity at sidebar bottom */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-black/10 p-4">
          <Link href="/account" className="flex items-center gap-3 group">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-xs font-black text-white">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-black group-hover:text-black/70 transition">
                {displayName ?? "···"}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-black/40">
                {ROLE_LABELS[role]}
              </p>
            </div>
          </Link>
        </div>
      </aside>

      <div className="lg:pl-72">
        {serverRole === "administrator" && <RolePreviewBanner />}
        <header className="sticky top-[7.25rem] z-10 border-b border-black/10 bg-white/95 px-5 py-3 backdrop-blur md:top-[72px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-black/40">
              {ROLE_LABELS[role]}
            </p>
            <p className="hidden text-sm font-medium text-black/50 md:block">{APP_SUBTITLE}</p>
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href="/account"
              className="flex items-center gap-2.5 border border-black/10 px-3 py-2 hover:border-black transition group"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-[10px] font-black text-white">
                {userInitials}
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.06em] text-black group-hover:text-black/70 transition">
                {displayName ?? "Account"}
              </span>
            </Link>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {visibleItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap border px-3 py-2 text-sm font-bold",
                  pathname === item.href || item.matches?.some((route) => pathname.startsWith(route))
                    ? "border-black bg-black text-white"
                    : "border-black/10 bg-white text-black/60"
                )}
              >
                {item.tKey ? t(item.tKey) : item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
        <footer className="border-t border-black/10 bg-white px-5 py-5 text-xs leading-5 text-black/50">
          {LEGAL_DISCLAIMER}
        </footer>
      </div>
    </div>
  );
}
