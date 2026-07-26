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

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!validUrl(url) || publishableKey.length < 20) return null;
  return Object.freeze({ url, publishableKey });
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicConfig() !== null;
}
