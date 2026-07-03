import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPreviewRole, resolveEffectiveRole } from "@/lib/preview-role";
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

const PENDING_APPROVAL_EXEMPT_PATHS = new Set(["/pending-approval", "/account"]);

export async function requireUser(nextPath: string): Promise<{ supabase: ReturnType<typeof createServerSupabaseClient>; user: User }> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    loginRedirect(nextPath);
    throw new Error("unreachable");
  }

  if (!PENDING_APPROVAL_EXEMPT_PATHS.has(nextPath)) {
    const { data: gateProfile } = await (supabase.from("profiles") as any)
      .select("role, user_status")
      .eq("id", user.id)
      .maybeSingle();

    // Importer accounts self-register but must be approved by an administrator
    // before they can access anything beyond /account and /pending-approval.
    if (gateProfile?.role === "us_importer" && gateProfile.user_status !== "active") {
      redirect("/pending-approval");
    }
  }

  return { supabase, user };
}

export async function requireProfileRole(
  nextPath: string,
  allowedRoles?: AppRole[]
): Promise<{ supabase: ReturnType<typeof createServerSupabaseClient>; user: User; role: AppRole; realRole: AppRole }> {
  const { supabase, user } = await requireUser(nextPath);
  const { data: profile } = (await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()) as unknown as RoleLookup;
  const realRole: AppRole = profile?.role ?? "supplier";

  // Access gating always uses the real role — an admin previewing as a
  // lower-privileged role must never lose access to a page they're
  // actually allowed on. What the page then renders/queries uses the
  // (possibly previewed) effective role below.
  if (allowedRoles && !allowedRoles.includes(realRole)) {
    restrictedRedirect(nextPath);
    throw new Error("unreachable");
  }

  const role = resolveEffectiveRole(realRole, getPreviewRole());

  return { supabase, user, role, realRole };
}
