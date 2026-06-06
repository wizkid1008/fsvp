"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { APP_NAME, PARENT_BRAND } from "@/lib/constants";
import { cn } from "@/lib/utils";

const menuItems = [
  { href: "/about", label: "Platform", hasDropdown: true },
  { href: "/suppliers", label: "Suppliers", hasDropdown: true },
  { href: "/evidence", label: "Evidence" },
  { href: "/reports", label: "Reports" }
];

const megaColumns = [
  {
    heading: "VERIFY",
    links: ["Supplier Records", "Commodity Risk", "Document Reviews", "Readiness Scoring", "Audit Trail"]
  },
  {
    heading: "WORKFLOWS",
    links: ["Foreign Supplier Portal", "Importer Review", "Corrective Actions", "Background Library", "Reports"]
  },
  {
    heading: "COMPLIANCE",
    links: ["FSVP Requirements", "Hazard Analysis", "Written Assurances", "Verification Activities", "FDA Records"]
  }
];

export function SiteMenu() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-black text-white">
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
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-1 py-7 text-xs font-black uppercase tracking-[0.04em] transition",
                  active ? "text-white" : "text-white/80 hover:text-white"
                )}
              >
                {item.label}
                {item.hasDropdown ? <ChevronDown className="h-3 w-3" strokeWidth={3} /> : null}
              </Link>
            );
          })}
          <div className="pointer-events-none absolute left-1/2 top-[72px] hidden w-[min(980px,calc(100vw-48px))] -translate-x-1/2 rounded-b-sm bg-black p-8 text-white opacity-0 shadow-[0_28px_80px_rgba(0,0,0,0.35)] transition group-hover:pointer-events-auto group-hover:block group-hover:opacity-100">
            <div className="grid gap-8 md:grid-cols-[1fr_1fr_1fr_280px]">
              {megaColumns.map((column) => (
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
                <p className="mb-5 text-[11px] font-black uppercase tracking-[0.08em] text-white/40">FOR IMPORT TEAMS</p>
                <div className="space-y-3">
                  <div className="rounded bg-white/10 p-4">
                    <p className="text-sm font-black">ThrushCross Verify</p>
                    <p className="mt-1 text-xs leading-5 text-white/55">Supplier verification, evidence review, and readiness reporting.</p>
                  </div>
                  <div className="rounded bg-white/10 p-4">
                    <p className="text-sm font-black">Compliance Library</p>
                    <p className="mt-1 text-xs leading-5 text-white/55">Reference documents and FSVP requirement mapping.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/login"
            className="hidden px-4 py-3 text-xs font-black uppercase tracking-[0.04em] text-white/85 hover:text-white sm:inline-flex"
          >
            Log in
          </Link>
          <Link href="/signup" className="inline-flex h-14 items-center border border-white bg-white px-6 text-xs font-black uppercase tracking-[0.04em] text-black hover:bg-black hover:text-white">
            Get started
          </Link>
        </div>
      </div>
      <nav className="flex gap-2 overflow-x-auto border-t border-white/15 px-5 py-2 md:hidden" aria-label="Mobile primary navigation">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "whitespace-nowrap px-3 py-2 text-xs font-black uppercase tracking-[0.04em]",
              pathname === item.href ? "bg-white text-black" : "text-white/80"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
