"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import { APP_NAME, PARENT_BRAND } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { NotificationBell } from "./NotificationBell";

type MenuKey = "platform" | "exporters" | "importers";

// Both audience links go to /dashboard: each role lands on its own dashboard,
// and the previous "Suppliers" entry pointed at /suppliers — the importer's
// exporter list, which a foreign supplier has no permission to open.
const menuItems: Array<{ href: string; activeHref: string; label: string; key: MenuKey }> = [
  { href: "/about", activeHref: "/about", label: "Platform", key: "platform" },
  { href: "/login?next=%2Fdashboard", activeHref: "/exporters", label: "Exporters", key: "exporters" },
  { href: "/login?next=%2Fdashboard", activeHref: "/dashboard", label: "Importers", key: "importers" }
];

/**
 * Two kinds of content, kept apart on purpose.
 *
 * Every entry used to be a `link`, and most had no href — so three columns of
 * bold white text sat inside a dropdown looking exactly like navigation and
 * doing nothing when clicked. The "NEXT STEPS" column was worse: four
 * differently-labelled links that all went to /signup.
 *
 * `items` is descriptive copy, styled so it does not read as clickable.
 * `cta` is the one real destination for that audience.
 */
type MegaColumn = {
  heading: string;
  items?: string[];
  cta?: { label: string; href: string };
};

const megaMenus: Record<MenuKey, MegaColumn[]> = {
  platform: [
    { heading: "OVERVIEW", items: ["Risk dashboard", "Workflow navigation", "Role-based access", "Audit-ready records"] },
    { heading: "TEAMS", items: ["Foreign suppliers and exporters", "U.S. importers", "Qualified individuals", "Administrators"] },
    { heading: "SYSTEM", items: ["Supabase Auth", "Private document storage", "RLS policies", "Cloudflare Pages"] }
  ],
  exporters: [
    { heading: "EXPORTER PROFILE", items: ["Legal entity", "Contacts", "Export markets", "FDA registration"] },
    { heading: "COMPLIANCE STATUS", items: ["Certifications", "Exporter questionnaire", "Importer relationship", "Ownership attestation"] },
    {
      heading: "GET STARTED",
      items: ["Create your exporter profile, attach evidence, and track what your importer still needs."],
      cta: { label: "Create an account", href: "/signup" }
    }
  ],
  importers: [
    { heading: "IMPORTER PROFILE", items: ["Organization details", "Contacts", "Assigned exporters", "Role management"] },
    { heading: "FSVP OVERSIGHT", items: ["Exporter approvals", "Verification activities", "Evidence requests", "Corrective actions"] },
    {
      heading: "GET STARTED",
      items: ["Importer accounts are approved by an administrator, usually within one business day."],
      cta: { label: "Create an account", href: "/signup" }
    }
  ]
};

export function SiteMenu() {
  const pathname = usePathname();
  const [activeMenu, setActiveMenu] = useState<MenuKey>("platform");
  // Pre-check: Supabase stores session in cookies starting with "sb-"
  // This gives us the correct state on first render without a flash
  const hasSessionCookie = typeof document !== "undefined"
    ? document.cookie.split(";").some((c) => c.trim().startsWith("sb-"))
    : false;
  const [loggedIn, setLoggedIn] = useState(hasSessionCookie);
  const { locale } = useLocale();

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession();
      setLoggedIn(!!session);
      if (!session?.user) {
        return;
      }
    }

    void loadUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session);
      if (session?.user) void loadUser();
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-black text-white" onMouseLeave={() => setActiveMenu("platform")}>
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between gap-4 px-5 md:px-8">
        <Link href="/" className="group flex min-w-0 items-center gap-3" aria-label={`${PARENT_BRAND} home`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center border border-white text-xs font-black tracking-[-0.08em]">
            TC
          </span>
          <span className="min-w-0">
            <span className="block truncate text-base font-black uppercase tracking-[0.08em]">{APP_NAME}</span>
          </span>
        </Link>
        {/* Marketing navigation, signed out only. Once you are in the app this
            bar is a place for app controls rather than audience landing pages.
            The mega-menu's dropdowns are still mostly non-clickable copy. */}
        {!loggedIn && (
        <nav className="group hidden items-center gap-8 md:flex" aria-label="Primary navigation">
          {menuItems.map((item) => {
            const active = pathname === item.activeHref;
            const href = loggedIn ? item.activeHref : item.href;
            return (
              <Link
                key={item.href}
                href={href}
                onMouseEnter={() => setActiveMenu(item.key)}
                className={cn(
                  "inline-flex items-center gap-1 py-7 text-xs font-black uppercase tracking-[0.04em] transition",
                  active ? "text-white" : "text-white/80 hover:text-white"
                )}
              >
                {item.label}
                <ChevronDown className="h-3 w-3" strokeWidth={3} />
              </Link>
            );
          })}
          <div className="pointer-events-none absolute left-1/2 top-[72px] hidden w-[min(760px,calc(100vw-48px))] -translate-x-1/2 rounded-b-sm bg-black p-8 text-white opacity-0 shadow-[0_28px_80px_rgba(0,0,0,0.35)] transition group-hover:pointer-events-auto group-hover:block group-hover:opacity-100">
            <div className="grid gap-8 md:grid-cols-3">
              {megaMenus[activeMenu].map((column) => (
                <div key={column.heading}>
                  <p className="mb-5 text-[11px] font-black uppercase tracking-[0.08em] text-white/40">{column.heading}</p>
                  {/* Normal weight and cursor-default: this is a description of
                      what the platform holds, not a list of destinations. */}
                  <ul className="space-y-2.5">
                    {(column.items ?? []).map((item) => (
                      <li key={item} className="cursor-default text-sm font-normal leading-6 text-white/65">
                        {item}
                      </li>
                    ))}
                  </ul>
                  {column.cta && (
                    <Link
                      href={column.cta.href}
                      className="mt-5 inline-flex h-11 items-center border border-white bg-white px-5 text-xs font-black uppercase tracking-[0.04em] text-black transition hover:bg-black hover:text-white"
                    >
                      {column.cta.label}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        </nav>
        )}
        <div className="flex shrink-0 items-center gap-3">
          {loggedIn ? (
            <NotificationBell />
          ) : (
            <>
              <LanguageSwitcher currentLocale={locale} variant="menu" />
              <Link
                href="/login"
                className="hidden px-4 py-3 text-xs font-black uppercase tracking-[0.04em] text-white/85 hover:text-white sm:inline-flex"
              >
                Log in
              </Link>
              <Link href="/signup" className="inline-flex h-14 items-center border border-white bg-white px-6 text-xs font-black uppercase tracking-[0.04em] text-black hover:bg-black hover:text-white">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
      {/* Signed in, AppShell renders its own mobile nav below this bar; two
          scrolling strips stacked on a phone is one too many. */}
      {!loggedIn && (
      <nav className="flex gap-2 overflow-x-auto border-t border-white/15 px-5 py-2 md:hidden" aria-label="Mobile primary navigation">
        {menuItems.map((item) => {
          const href = loggedIn ? item.activeHref : item.href;
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "whitespace-nowrap px-3 py-2 text-xs font-black uppercase tracking-[0.04em]",
                pathname === item.activeHref ? "bg-white text-black" : "text-white/80"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      )}
    </header>
  );
}
