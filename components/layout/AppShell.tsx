"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LEGAL_DISCLAIMER } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { iconMap, navItems } from "@/data/platform";
import { RolePreviewBanner } from "@/components/admin/RolePreview";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isExporterType, supplierRoleLabel } from "@/lib/supplier-context";
import type { AppRole } from "@/types/platform";

const PREVIEW_KEY = "fsvp_preview_role";

const ROLE_LABELS: Record<AppRole, string> = {
  supplier:      "Supplier",
  us_importer:   "US Importer",
  reviewer:      "Reviewer",
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
  role: serverRole = "supplier",
  supplierType: serverSupplierType,
}: {
  children: React.ReactNode;
  role?: AppRole;
  supplierType?: string | null;
}) {
  const pathname = usePathname();
  const [role, setRole]               = useState<AppRole>(serverRole);
  const [supplierType, setSupplierType] = useState<string | null>(serverSupplierType ?? null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState<string>("..");

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
        .select("full_name, organization_name, supplier_id")
        .eq("id", user.id)
        .maybeSingle();

      const name = profile?.full_name ?? null;
      setUserInitials(initials(name, user.email ?? ""));
      setDisplayName(name || (user.email ?? "").split("@")[0]);

      // Fetch supplier_type if not passed from server
      if (!serverSupplierType && profile?.supplier_id) {
        const { data: supplier } = await (supabase.from("suppliers") as any)
          .select("supplier_type")
          .eq("id", profile.supplier_id)
          .maybeSingle();
        if (supplier?.supplier_type) setSupplierType(supplier.supplier_type);
      }
    }
    void loadUser();
  }, [serverSupplierType]);

  const { locale, t } = useLocale();

  // Determine which nav items to show
  const visibleItems = navItems.filter((item) => {
    // Role check
    if (item.roles && !item.roles.includes(role)) {
      // Always show admin to real admins even when previewing
      if (serverRole === "administrator" && item.href === "/admin") return true;
      return false;
    }

    // Supplier-type check (only applies when role is supplier)
    if (role === "supplier" && item.supplierTypes && supplierType) {
      const isExp = isExporterType(supplierType);
      if (item.supplierTypes.includes("exporter") && !item.supplierTypes.includes("manufacturer")) {
        return isExp;
      }
      if (item.supplierTypes.includes("manufacturer") && !item.supplierTypes.includes("exporter")) {
        return !isExp;
      }
    }

    return true;
  });

  // Role label shown at the bottom of sidebar
  const roleLabel = serverRole === "supplier" && supplierType
    ? supplierRoleLabel(supplierType)
    : ROLE_LABELS[role];

  return (
    <div className="min-h-screen bg-white text-black">
      <aside className="fixed bottom-0 left-0 top-[72px] hidden w-72 overflow-y-auto border-r border-black/10 bg-white p-5 lg:block">
        <nav className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = iconMap[item.icon as keyof typeof iconMap];
            const active = pathname === item.href || item.matches?.some((r) => pathname.startsWith(r));
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

        <div className="absolute bottom-0 left-0 right-0 border-t border-black/10 p-4 space-y-3">
          <LanguageSwitcher currentLocale={locale} />
          <Link href="/account" className="flex items-center gap-3 group">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-xs font-black text-white">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-black group-hover:text-black/70 transition">
                {displayName ?? "..."}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-black/40">
                {roleLabel}
              </p>
            </div>
          </Link>
        </div>
      </aside>

      <div className="lg:pl-72">
        {serverRole === "administrator" && <RolePreviewBanner />}
        <nav className="flex gap-2 overflow-x-auto border-b border-black/10 bg-white/95 px-5 py-2 lg:hidden">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap border px-3 py-2 text-sm font-bold",
                pathname === item.href || item.matches?.some((r) => pathname.startsWith(r))
                  ? "border-black bg-black text-white"
                  : "border-black/10 bg-white text-black/60"
              )}
            >
              {item.tKey ? t(item.tKey) : item.label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
        <footer className="border-t border-black/10 bg-white px-5 py-5 text-xs leading-5 text-black/50">
          {LEGAL_DISCLAIMER}
        </footer>
      </div>
    </div>
  );
}
