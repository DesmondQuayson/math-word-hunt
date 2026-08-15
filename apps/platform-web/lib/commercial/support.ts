import "server-only";

export function getSupportEmail(source: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const value = source.MVH_SUPPORT_EMAIL?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254 ? value : null;
}
