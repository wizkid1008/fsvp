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
import { LOCALE_LABELS } from "@/lib/i18n/locales";

type MenuKey = "platform" | "suppliers" | "evidence" | "reports";

const menuItems: Array<{ href: string; activeHref: string; label: string; key: MenuKey }> = [
  { href: "/about", activeHref: "/about", label: "Platform", key: "platform" },
  { href: "/login?next=%2Fsuppliers", activeHref: "/suppliers", label: "Suppliers", key: "suppliers" },
  { href: "/login?next=%2Fevidence", activeHref: "/evidence", label: "Evidence", key: "evidence" },
  { href: "/login?next=%2Freports", activeHref: "/reports", label: "Reports", key: "reports" }
];

const megaMenus: Record<MenuKey, Array<{ heading: string; links: string[] }>> = {
  platform: [
    { heading: "OVERVIEW", links: ["Risk dashboard", "Workflow navigation", "Role-based access", "Audit-ready records"] },
    { heading: "TEAMS", links: ["Foreign suppliers", "U.S. importers", "Reviewers", "Administrators"] },
    { heading: "SYSTEM", links: ["Supabase Auth", "Private document storage", "RLS policies", "Cloudflare Pages"] }
  ],
  suppliers: [
    { heading: "SUPPLIER PROFILE", links: ["Legal entity", "Contacts", "Export markets", "FDA registration"] },
    { heading: "COMPLIANCE STATUS", links: ["Certifications", "Supplier questionnaire", "Importer relationship", "Ownership attestation"] },
    { heading: "NEXT STEPS", links: ["Create supplier", "Attach evidence", "Review readiness", "Resolve gaps"] }
  ],
  evidence: [
    { heading: "DOCUMENTS", links: ["Evidence uploads", "Document versions", "Categories", "Review status"] },
    { heading: "FSVP MAPPING", links: ["Required evidence", "Uploaded evidence", "Reviewer decision", "Gap status"] },
    { heading: "LIBRARY", links: ["FDA references", "Background documents", "Audit packet", "Requirement index"] }
  ],
  reports: [
    { heading: "READINESS", links: ["Readiness score", "Critical gaps", "Corrective actions", "Final status"] },
    { heading: "EXPORTS", links: ["Readiness report", "Gap report", "Audit report", "Evidence index"] },
    { heading: "REVIEW", links: ["Reviewer notes", "Approvals", "Open findings", "Report history"] }
  ]
};

export function SiteMenu() {
  const pathname = usePathname();
  const [activeMenu, setActiveMenu] = useState<MenuKey>("platform");
  const [loggedIn, setLoggedIn] = useState(false);
  const { locale } = useLocale();

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setLoggedIn(!!session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session);
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
        <nav className="group hidden items-center gap-8 md:flex" aria-label="Primary navigation">
          {menuItems.map((item) => {
            const active = pathname === item.activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
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
          <div className="pointer-events-none absolute left-1/2 top-[72px] hidden w-[min(980px,calc(100vw-48px))] -translate-x-1/2 rounded-b-sm bg-black p-8 text-white opacity-0 shadow-[0_28px_80px_rgba(0,0,0,0.35)] transition group-hover:pointer-events-auto group-hover:block group-hover:opacity-100">
            <div className="grid gap-8 md:grid-cols-[1fr_1fr_1fr_280px]">
              {megaMenus[activeMenu].map((column) => (
                <div key={column.heading}>
                  <p className="mb-5 text-[11px] font-black uppercase tracking-[0.08em] text-white/40">{column.heading}</p>
                  <div className="space-y-3">
                    {column.links.map((link) => (
                      <p key={link} className="text-sm font-bold text-white/90">{link}</p>
                    ))}
                  </div>
                </div>
              ))}
              <div className="border-l border-white/15 pl-7">
                <p className="mb-5 text-[11px] font-black uppercase tracking-[0.08em] text-white/40">CURRENT AREA</p>
                <div className="rounded bg-white/10 p-4">
                  <p className="text-sm font-black">{menuItems.find((item) => item.key === activeMenu)?.label}</p>
                  <p className="mt-1 text-xs leading-5 text-white/55">
                    Hover another top-level title to preview its workflow-specific menu.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          <LanguageSwitcher currentLocale={locale} variant="menu" />
          {loggedIn ? (
            <Link href="/dashboard" className="inline-flex h-14 items-center border border-white bg-white px-6 text-xs font-black uppercase tracking-[0.04em] text-black hover:bg-black hover:text-white">
              Dashboard
            </Link>
          ) : (
            <>
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
      <nav className="flex gap-2 overflow-x-auto border-t border-white/15 px-5 py-2 md:hidden" aria-label="Mobile primary navigation">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "whitespace-nowrap px-3 py-2 text-xs font-black uppercase tracking-[0.04em]",
              pathname === item.activeHref ? "bg-white text-black" : "text-white/80"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
