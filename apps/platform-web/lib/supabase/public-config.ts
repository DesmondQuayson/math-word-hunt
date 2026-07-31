export type SupabasePublicConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getSupabasePublicConfig(source: NodeJS.ProcessEnv = process.env): SupabasePublicConfig | null {
  if (isProductionPublicMode(source)) return null;
  if (isProductionPlatformMode(source) && (!hasProductionIdentityConfiguration(source) || hasPreviewCredentialCollision(source))) return null;
  const url = source.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey = source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!validUrl(url) || publishableKey.length < 20) return null;
  return Object.freeze({ url, publishableKey });
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicConfig() !== null;
}
import { isProductionPublicMode } from "@/lib/environment/production-public";
import {
  hasPreviewCredentialCollision,
  hasProductionIdentityConfiguration,
  isProductionPlatformMode
} from "@/lib/environment/production-platform";
