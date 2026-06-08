import { AppShell } from "@/components/layout/AppShell";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { requireUser } from "@/lib/auth/protection";
import type { Country, Profile } from "@/types/database";

export const runtime = "edge";

type ProfileLookup = {
  data: Profile | null;
};

type CountryLookup = {
  data: Pick<Country, "country_code" | "country_name">[] | null;
};

export default async function AccountPage() {
  const { supabase, user } = await requireUser("/account");

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
    </AppShell>
  );
}
