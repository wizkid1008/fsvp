import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";
import type { AppRole } from "@/types/platform";

export const runtime = "edge";

type RoleLookup = {
  data: Pick<Profile, "role"> | null;
};

type InvitePayload = {
  email?: string;
  fullName?: string;
  organizationName?: string;
  role?: AppRole;
};

const allowedRoles: AppRole[] = ["supplier", "us_importer", "reviewer", "administrator"];

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function requireAdministrator() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "You must be signed in." }, { status: 401 }) };
  }

  const { data: profile } = (await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()) as unknown as RoleLookup;

  if (profile?.role !== "administrator") {
    return { error: NextResponse.json({ error: "Only administrators can invite users." }, { status: 403 }) };
  }

  return { user };
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdministrator();
  if ("error" in adminCheck) {
    return adminCheck.error;
  }

  const payload = (await request.json().catch(() => ({}))) as InvitePayload;
  const email = cleanText(payload.email).toLowerCase();
  const fullName = cleanText(payload.fullName);
  const organizationName = cleanText(payload.organizationName);
  const role = allowedRoles.includes(payload.role as AppRole) ? (payload.role as AppRole) : "supplier";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const adminSupabase = createAdminSupabaseClient();
    const redirectTo = new URL("/auth/callback?next=/verified", request.url).toString();
    const { data, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName || undefined,
        organization_name: organizationName || undefined,
        role
      },
      redirectTo
    });

    if (inviteError) {
      throw inviteError;
    }

    if (!data.user?.id) {
      return NextResponse.json({ error: "Supabase did not return an invited user." }, { status: 502 });
    }

    const { error: profileError } = await adminSupabase
      .from("profiles")
      .upsert({
        id: data.user.id,
        email,
        full_name: fullName || null,
        organization_name: organizationName || null,
        role,
        user_status: "pending"
      }, { onConflict: "id" });

    if (profileError) {
      throw profileError;
    }

    return NextResponse.json({ ok: true, email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send invitation.";
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
