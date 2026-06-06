import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
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

export async function requireUser(nextPath: string): Promise<{ supabase: ReturnType<typeof createServerSupabaseClient>; user: User }> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    loginRedirect(nextPath);
    throw new Error("unreachable");
  }

  return { supabase, user };
}

export async function requireProfileRole(nextPath: string, allowedRoles?: AppRole[]): Promise<{ supabase: ReturnType<typeof createServerSupabaseClient>; user: User; role: AppRole }> {
  const { supabase, user } = await requireUser(nextPath);
  const { data: profile } = (await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()) as unknown as RoleLookup;
  const role: AppRole = profile?.role ?? "supplier";

  if (allowedRoles && !allowedRoles.includes(role)) {
    restrictedRedirect(nextPath);
    throw new Error("unreachable");
  }

  return { supabase, user, role };
}
