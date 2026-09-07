import "server-only";

import { createClient } from "@supabase/supabase-js";

import { createUncachedFetch } from "./fetch";
import { isProductionPublicMode } from "@/lib/environment/production-public";
import { hasPreviewCredentialCollision, hasProductionIdentityConfiguration, isProductionPlatformMode } from "@/lib/environment/production-platform";

export function createServiceSupabaseClient() {
  if (isProductionPublicMode()) return null;
  if (isProductionPlatformMode() && (!hasProductionIdentityConfiguration() || hasPreviewCredentialCollision())) return null;
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
  if (!/^https?:\/\//.test(url) || secretKey.length < 20) return null;
  // Server-authority reads (webhooks, reconciliation, admin) must always see
  // the current row, never a memoized copy from earlier in the same render.
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: createUncachedFetch() }
  });
}
