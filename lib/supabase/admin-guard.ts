/**
 * Constructing the admin client without taking the page down with it.
 *
 * `createAdminSupabaseClient()` throws when SUPABASE_SERVICE_ROLE_KEY is absent
 * at request time — a deployment configuration problem, not a data fault. On
 * 2026-08-10 that took out all thirteen pages which build the client
 * unconditionally, and every one of them rendered Next's opaque error digest,
 * because Next strips `error.message` from server errors in production and
 * hands the boundary only a hash. The real message was reachable only from
 * Cloudflare's deployment logs.
 *
 * A page that cannot reach the database should say which piece of configuration
 * is missing. It costs three lines per page and turns "the app is broken" into
 * a specific, actionable sentence.
 *
 * See docs/cloudflare-pages.md — the usual cause is the key sitting in
 * Cloudflare's build-scope Variables rather than in runtime Bindings.
 */

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AdminClientResult =
  | { ok: true; client: ReturnType<typeof createAdminSupabaseClient> }
  | { ok: false; message: string };

export function tryAdminClient(): AdminClientResult {
  try {
    return { ok: true, client: createAdminSupabaseClient() };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
