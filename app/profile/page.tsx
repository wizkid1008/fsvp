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

export default async function ProfilePage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile");
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
        title="User Profile"
        description="Maintain identity details linked to Supabase Auth, including role, supplier relationship, status, and login history."
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
