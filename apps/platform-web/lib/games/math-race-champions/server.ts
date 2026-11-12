import "server-only";

import { PRODUCTION_PUBLIC_CANONICAL_HOST, PRODUCTION_PUBLIC_WWW_HOST } from "@/lib/environment/production-public";
import { isStagingAccessRequired } from "@/lib/staging-access/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Math Race Champions — server side.
 *
 * Classroom Competition runs entirely on the Smart Board and needs nothing
 * here. Computer Race and Online Race are server-checked: the database owns
 * identity, Race Dollars and the clock, and this module replays every answer
 * through the same question engine the browser used.
 */

export const GAME_KEY = "math-race-champions";
export const PLAY_ROUTE = "/games/math-race-champions/play";
export const JOIN_ROUTE = "/join";
export const PREVIEW_FLAG = "MVH_MATH_RACE_CHAMPIONS_PREVIEW";
export const PREVIEW_VALUE = "local-owner-review";
export const STAGING_PREVIEW_VALUE = "staging-owner-review";
/** The isolated staging Supabase project; production never points here. */
const STAGING_SUPABASE_HOST = "gcmuhzxkwvfireyrearl.supabase.co";

// ------------------------------------------------------------- availability

/**
 * The draft may be served only for a local owner review: the explicit flag, a
 * loopback application origin, and not on any Vercel deployment. A hosted
 * environment can therefore never expose it, whatever its variables.
 */
export function isLocalOwnerPreview(source: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (source[PREVIEW_FLAG]?.trim() !== PREVIEW_VALUE) return false;
  if (source.VERCEL || source.VERCEL_ENV || source.VERCEL_URL) return false;
  const origin = source.MVH_APPLICATION_ORIGIN?.trim() || source.APP_BASE_URL?.trim() || "";
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

function hostOf(value: string | undefined): string | null {
  try {
    return new URL(value?.trim() ?? "").hostname;
  } catch {
    return null;
  }
}

/**
 * The draft may also be served for the owner's STAGING review, and only there:
 * the staging flag (set per deployment, never as a project variable), both
 * Supabase URLs on the isolated staging project, an origin that is not
 * mathnexa.com, and a protected staging Preview. Production fails every one.
 */
export function isStagingOwnerPreview(source: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (source[PREVIEW_FLAG]?.trim() !== STAGING_PREVIEW_VALUE) return false;
  if (hostOf(source.SUPABASE_URL) !== STAGING_SUPABASE_HOST || hostOf(source.NEXT_PUBLIC_SUPABASE_URL) !== STAGING_SUPABASE_HOST) return false;
  const origin = hostOf(source.MVH_APPLICATION_ORIGIN);
  if (!origin || origin === PRODUCTION_PUBLIC_CANONICAL_HOST || origin === PRODUCTION_PUBLIC_WWW_HOST) return false;
  return source.VERCEL_ENV?.trim() === "preview" || isStagingAccessRequired(source);
}

let availabilityCache: { at: number; value: boolean } | null = null;

/** Published in the catalog, or a draft under the local or staging owner preview. */
export async function isMathRaceChampionsAvailable(now = Date.now()): Promise<boolean> {
  if (availabilityCache && now - availabilityCache.at < 15_000) return availabilityCache.value;
  const client = createServiceSupabaseClient();
  if (!client) return false;
  const { data, error } = await client.from("game_catalog_entries").select("status").eq("stable_key", GAME_KEY).maybeSingle();
  const status = error ? null : (data as { status?: string } | null)?.status ?? null;
  const value = status === "published" || (status === "draft" && (isLocalOwnerPreview() || isStagingOwnerPreview()));
  availabilityCache = { at: now, value };
  return value;
}

export function resetAvailabilityCacheForTests(): void {
  availabilityCache = null;
}
