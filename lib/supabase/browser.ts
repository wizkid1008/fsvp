"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database";

export function createBrowserSupabaseClient() {
  const { url, anonKey } = getSupabaseConfig();

  if (!url || !anonKey) {
    throw new Error("Supabase browser environment variables are not configured.");
  }

  return createBrowserClient<Database>(url, anonKey);
}
