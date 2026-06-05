const FALLBACK_SUPABASE_URL = "https://rkrwhkcfyfojsvivbbsb.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "sb_publishable__Fu_H0Sr7TN8yDGT_k2rZA_DqYGCobz";

function cleanSupabaseValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && !trimmed.includes("xxxxx.supabase.co") ? trimmed : undefined;
}

export function getSupabaseConfig() {
  return {
    url: cleanSupabaseValue(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? FALLBACK_SUPABASE_URL,
    anonKey: cleanSupabaseValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ?? FALLBACK_SUPABASE_ANON_KEY
  };
}
