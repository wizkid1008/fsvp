"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, BRAND_TAGLINE, PARENT_BRAND } from "@/lib/constants";
import { cn } from "@/lib/utils";

const menuItems = [
  { href: "/", label: "Home" },
  { href: "/about", label: "Platform" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/contact", label: "Contact" }
];

export function SiteMenu() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5">
        <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${PARENT_BRAND} home`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#0A2540] text-xs font-bold text-white">
            TX
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink">{APP_NAME}</span>
            <span className="hidden truncate text-xs font-medium text-slate-500 sm:block">{BRAND_TAGLINE}</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
          {menuItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-semibold transition",
                  active ? "bg-sky-50 text-[#0A2540]" : "text-slate-600 hover:bg-slate-50 hover:text-ink"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-md border border-line px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:inline-flex"
          >
            Sign in
          </Link>
          <Link href="/signup" className="rounded-md bg-[#2DA8FF] px-3 py-2 text-sm font-semibold text-[#0A2540] hover:bg-sky-300">
            Start
          </Link>
        </div>
      </div>
      <nav className="flex gap-2 overflow-x-auto border-t border-line px-5 py-2 md:hidden" aria-label="Mobile primary navigation">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold",
              pathname === item.href ? "bg-sky-50 text-[#0A2540]" : "text-slate-600"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
