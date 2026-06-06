import { getCurrentProfileRole, WorkflowPage } from "@/components/WorkflowPage";

export default async function AccountPage() {
  const role = await getCurrentProfileRole();

  return (
    <WorkflowPage
      role={role}
      title="Account"
      description="Manage your personal profile, security preferences, language, and notification settings in one place."
      primaryAction="Update account"
      cards={[
        {
          title: "Profile",
          description: "Maintain your signed-in user details without mixing them into supplier compliance records.",
          href: "/profile",
          action: "Edit profile",
          items: ["Name and email", "Organization", "Country", "Role and status"]
        },
        {
          title: "Settings",
          description: "Manage account preferences, password reset, language, and security posture.",
          href: "/settings",
          action: "Open settings",
          items: ["Preferred language", "Security", "Password reset", "Session preferences"]
        },
        {
          title: "Notifications",
          description: "Control review requests, expiring certification alerts, approval notices, and reminder preferences.",
          href: "/notifications",
          action: "View alerts",
          items: ["Review requests", "Expiry reminders", "Approval notices", "Delivery preferences"]
        }
      ]}
    />
  );
}
