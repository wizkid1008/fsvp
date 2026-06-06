import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";
import type { AppRole } from "@/types/platform";

type RoleLookup = {
  data: Pick<Profile, "role"> | null;
};

function loginRedirect(nextPath: string) {
  redirect(`/login?next=${encodeURIComponent(nextPath)}`);
}

function restrictedRedirect(nextPath: string) {
  redirect(`/dashboard?restricted=${encodeURIComponent(nextPath)}`);
}

export async function requireUser(nextPath: string) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    loginRedirect(nextPath);
  }

  return { supabase, user };
}

export async function requireProfileRole(nextPath: string, allowedRoles?: AppRole[]) {
  const { supabase, user } = await requireUser(nextPath);
  const { data: profile } = (await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()) as unknown as RoleLookup;
  const role = profile?.role ?? "supplier";

  if (allowedRoles && !allowedRoles.includes(role)) {
    restrictedRedirect(nextPath);
  }

  return { supabase, user, role };
}
