import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Country, Profile } from "@/types/database";

type ProfileLookup = {
  data: Profile | null;
};

type CountryLookup = {
  data: Pick<Country, "country_code" | "country_name">[] | null;
};

const accountSections = [
  {
    title: "Security",
    detail: "Password reset and email verification are handled through Supabase Auth.",
    items: ["Email verification", "Password recovery", "Session protection"]
  },
  {
    title: "Preferences",
    detail: "Language and profile preferences live with your account profile.",
    items: ["Preferred language", "Country", "Organization"]
  },
  {
    title: "Notifications",
    detail: "Review requests, expiring documents, approvals, and reminders will surface from the dashboard.",
    items: ["Review requests", "Expiry reminders", "Approval notices"]
  }
];

export default async function AccountPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account");
  }

  const [{ data: profile }, { data: countries }] = await Promise.all([
    (await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()) as unknown as ProfileLookup,
    (await supabase
      .from("countries")
      .select("country_code,country_name")
      .eq("is_active", true)
      .order("country_name")) as unknown as CountryLookup
  ]);

  const role = profile?.role ?? "supplier";

  return (
    <AppShell role={role}>
      <SectionHeader
        title="Account"
        description="Manage your profile, security preferences, language, and notification preferences in one place."
      />

      <ProfileForm
        authEmail={user.email ?? ""}
        countries={countries ?? []}
        profile={profile}
        userId={user.id}
      />

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        {accountSections.map((section) => (
          <article key={section.title} className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <h2 className="text-base font-semibold text-ink">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{section.detail}</p>
            <div className="mt-4 space-y-2">
              {section.items.map((item) => (
                <div key={item} className="rounded-md border border-line bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
