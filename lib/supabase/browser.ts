"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error("Supabase browser environment variables are not configured.");
  }

  return createBrowserClient<Database>(url, anonKey);
}
