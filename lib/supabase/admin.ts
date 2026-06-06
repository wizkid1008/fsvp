import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database";

function cleanServiceRoleKey(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && !trimmed.includes("xxxxx") ? trimmed : undefined;
}

export function createAdminSupabaseClient() {
  const { url } = getSupabaseConfig();
  const serviceRoleKey = cleanServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
