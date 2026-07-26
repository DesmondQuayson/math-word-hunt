const CANONICAL_REPOSITORY_PATH = "/docs/index.html";

function isSafeLegacyDestination(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ||
      (url.protocol === "http:" &&
        (url.hostname === "127.0.0.1" || url.hostname === "localhost"));
  } catch {
    return false;
  }
}

export function getLegacyGameDestination(
  configuredValue = process.env.LEGACY_GAME_URL
): string {
  if (configuredValue && isSafeLegacyDestination(configuredValue)) {
    return configuredValue;
  }
  return CANONICAL_REPOSITORY_PATH;
}
