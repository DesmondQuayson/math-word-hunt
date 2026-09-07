import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { createUncachedFetch } from "./fetch";
import { getSupabasePublicConfig } from "./public-config";

/**
 * @param options.uncached Opt this client's reads out of Next.js request
 * memoization and the data cache. Required wherever a read must observe a
 * write made earlier in the same render (the access gate re-reading the
 * entitlement it just repaired).
 */
export async function createServerSupabaseClient(options: Readonly<{ uncached?: boolean }> = {}) {
  const config = getSupabasePublicConfig();
  if (!config) return null;
  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    ...(options.uncached ? { global: { fetch: createUncachedFetch() } } : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. proxy.ts performs refresh writes.
        }
      }
    }
  });
}
