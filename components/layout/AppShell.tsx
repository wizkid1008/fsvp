"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, LEGAL_DISCLAIMER } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { iconMap, navItems } from "@/data/platform";
import type { AppRole } from "@/types/platform";

export function AppShell({
  children,
  role = "supplier"
}: {
  children: React.ReactNode;
  role?: AppRole;
}) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) => !item.roles || item.roles.includes(role));

  return (
    <div className="min-h-screen bg-panel">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-line bg-white p-5 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-forest text-sm font-bold text-white">FS</div>
          <div>
            <p className="text-sm font-semibold text-ink">{APP_NAME}</p>
            <p className="text-xs text-slate-500">Supplier readiness workspace</p>
          </div>
        </Link>
        <nav className="mt-8 space-y-1">
          {visibleItems.map((item) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap];
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition",
                  active ? "bg-emerald-50 text-forest" : "text-slate-600 hover:bg-slate-50 hover:text-ink"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-line bg-white/95 px-5 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-600">Role: <span className="capitalize text-ink">{role}</span></p>
            <Link href="/settings" className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Account Settings
            </Link>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {visibleItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-md border px-3 py-2 text-sm",
                  pathname === item.href ? "border-forest bg-emerald-50 text-forest" : "border-line bg-white text-slate-600"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
        <footer className="border-t border-line bg-white px-5 py-5 text-xs leading-5 text-slate-500">
          {LEGAL_DISCLAIMER}
        </footer>
      </div>
    </div>
  );
}
