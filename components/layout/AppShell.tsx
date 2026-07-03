"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LEGAL_DISCLAIMER } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { iconMap, navItems } from "@/data/platform";
import { RolePreviewBanner } from "@/components/admin/RolePreview";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { isExporterType, supplierRoleLabel } from "@/lib/supplier-context";
import { PREVIEW_ROLE_COOKIE } from "@/lib/preview-role-constants";
import type { AppRole } from "@/types/platform";

function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

const ROLE_LABELS: Record<AppRole, string> = {
  supplier:      "Supplier",
  exporter:      "Exporter",
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
  realRole,
  supplierType: serverSupplierType,
}: {
  children: React.ReactNode;
  role?: AppRole;
  // The signed-in user's actual role. Defaults to `role` for pages that
  // haven't been updated to resolve preview roles server-side — on those
  // pages `role` is always the real role anyway, so this stays accurate.
  realRole?: AppRole;
  supplierType?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const actualRole = realRole ?? serverRole;
  const [role, setRole]               = useState<AppRole>(serverRole);
  const [supplierType, setSupplierType] = useState<string | null>(serverSupplierType ?? null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState<string>("..");

  const VALID_ROLES = new Set<AppRole>(["supplier", "exporter", "us_importer", "reviewer", "administrator"]);

  useEffect(() => {
    if (actualRole === "administrator") {
      const preview = readCookie(PREVIEW_ROLE_COOKIE) as AppRole | null;
      if (preview && VALID_ROLES.has(preview)) setRole(preview);
    }
  }, [actualRole]);

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

  async function handleLogout() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  // Determine which nav items to show
  const visibleItems = navItems.filter((item) => {
    // Role check
    if (item.roles && !item.roles.includes(role)) {
      // Always show admin to real admins even when previewing
      if (actualRole === "administrator" && item.href === "/admin") return true;
      return false;
    }

    // With the exporter/supplier role split, supplierTypes filtering is no longer
    // needed — role itself is the discriminator. Legacy nav items that still carry
    // supplierTypes are filtered here for backward compatibility only.
    if (item.supplierTypes) {
      if (role === "supplier") {
        // supplier role = upstream manufacturer; only show manufacturer items
        if (item.supplierTypes.includes("manufacturer") && !item.supplierTypes.includes("exporter")) return true;
        if (item.supplierTypes.includes("exporter") && !item.supplierTypes.includes("manufacturer")) return false;
      }
      // exporter role has no supplierTypes restriction — items already gated by roles[]
    }

    return true;
  });

  // Role label shown at the bottom of sidebar
  const roleLabel = ROLE_LABELS[role] ?? "Unknown";

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
          <div className="group relative">
            <Link href="/account" className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-xs font-black text-white">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-black transition group-hover:text-black/70">
                  {displayName ?? "..."}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-black/40">
                  {roleLabel}
                </p>
              </div>
            </Link>
            <div className="absolute bottom-full left-0 z-10 hidden w-full pb-2 group-hover:block bg-white">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full border border-black/10 bg-white px-3 py-2 text-left text-xs font-bold text-black shadow-lg hover:bg-black/5"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        {actualRole === "administrator" && <RolePreviewBanner />}
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
