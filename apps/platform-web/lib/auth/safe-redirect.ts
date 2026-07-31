const allowedDestinations = new Set([
  "/teacher",
  "/account",
  "/update-password",
  "/subscription",
  "/game-access",
  "/play"
]);

export function safeInternalRedirect(value: string | null | undefined, fallback = "/teacher"): string {
  if (!value || !allowedDestinations.has(value)) return fallback;
  return value;
}

export function getAppBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) {
        return url.origin;
      }
    } catch {
      // Fall through to the local-only default.
    }
  }
  return "http://127.0.0.1:3000";
}
