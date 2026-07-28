import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SecuritySettings } from "@/components/account/SecuritySettings";
import { requireUser } from "@/lib/auth/protection";
import type { Profile } from "@/types/database";

export const runtime = "edge";

export default async function SettingsPage() {
  const { supabase, user } = await requireUser("/settings");

  const { data: profile } = (await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()) as unknown as { data: Profile | null };

  const role = profile?.role ?? "supplier";
  const email = profile?.email || user.email || "";

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Settings"
        description="Manage your password and review your account status. For name, contact, and organization details, see Account."
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <SecuritySettings email={email} />

        <aside className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h2 className="text-base font-semibold text-ink">Account Status</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
              <span className="text-sm font-medium text-slate-700">Role</span>
              <StatusBadge tone="info">{role}</StatusBadge>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-slate-700">Status</span>
              <StatusBadge tone={profile?.user_status === "active" ? "success" : "warning"}>
                {profile?.user_status ?? "pending"}
              </StatusBadge>
            </div>
          </div>
          <Link
            href="/account"
            className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md border border-line text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Edit profile & organization details
          </Link>
        </aside>
      </div>
    </AppShell>
  );
}
