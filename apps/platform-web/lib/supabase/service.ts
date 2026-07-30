import "server-only";

import { createClient } from "@supabase/supabase-js";
import { isProductionPublicMode } from "@/lib/environment/production-public";

export function createServiceSupabaseClient() {
  if (isProductionPublicMode()) return null;
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
  if (!/^https?:\/\//.test(url) || secretKey.length < 20) return null;
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
