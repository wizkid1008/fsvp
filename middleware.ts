import { NextResponse, type NextRequest } from "next/server";
import { protectedRoutes, roleProtectedRoutes } from "@/lib/constants";
import { updateSession } from "@/lib/supabase/middleware";
import type { Profile } from "@/types/database";

type RoleLookupResult = {
  data: Pick<Profile, "role"> | null;
};

export async function middleware(request: NextRequest) {
  const result = await updateSession(request);
  if (result instanceof NextResponse) {
    return result;
  }

  const { response, supabase, user } = result;
  const pathname = request.nextUrl.pathname;
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));

  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const restrictedEntry = Object.entries(roleProtectedRoutes).find(([route]) => pathname.startsWith(route));
  if (restrictedEntry && user) {
    const [, allowedRoles] = restrictedEntry;
    const { data: profile } = (await supabase.from("profiles").select("role").eq("id", user.id).single()) as RoleLookupResult;
    if (!profile || !allowedRoles.includes(profile.role)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      redirectUrl.searchParams.set("restricted", pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
