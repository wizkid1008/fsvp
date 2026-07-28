import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { NotificationsList } from "@/components/notifications/NotificationsList";
import { requireProfileRole } from "@/lib/auth/protection";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "edge";

export default async function NotificationsPage() {
  const { role, realRole } = await requireProfileRole("/notifications", ["us_importer", "administrator"]);
  const supabase = createServerSupabaseClient();

  const { data: rawNotifications } = await (supabase.from("app_notifications") as any)
    .select("id, title, body, target_url, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const notifications = (rawNotifications ?? []) as Array<{
    id: string;
    title: string;
    body: string | null;
    target_url: string | null;
    created_at: string;
    read_at: string | null;
  }>;

  return (
    <AppShell role={role} realRole={realRole}>
      <SectionHeader
        title="Notifications"
        description="Certificate expirations, review requests, approvals, and other account events."
      />
      <div className="mt-6">
        <NotificationsList notifications={notifications} />
      </div>
    </AppShell>
  );
}
