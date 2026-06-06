import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const runtime = "edge";

type CookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
};

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  const redirectResponse = NextResponse.redirect(`${origin}${next}`);

  if (code) {
    const { url, anonKey } = getSupabaseConfig();
    const pending: Array<{ name: string; value: string; options: CookieOptions }> = [];

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        get: (name: string) => request.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          pending.push({ name, value, options });
        },
        remove: (name: string, options: CookieOptions) => {
          pending.push({ name, value: "", options });
        }
      }
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      for (const { name, value, options } of pending) {
        redirectResponse.cookies.set(name, value, options as Parameters<typeof redirectResponse.cookies.set>[2]);
      }
    }
  }

  return redirectResponse;
}
