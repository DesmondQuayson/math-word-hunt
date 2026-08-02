import "server-only";

export type AdminEnvironmentSource = Readonly<Record<string, string | undefined>>;

export type AdminSecurityConfig = Readonly<{
  csrfSecret: string;
  applicationOrigin: string;
  secureCookie: boolean;
  sessionMinutes: number;
  loginMaxAttempts: number;
  mfaMaxAttempts: number;
  rateWindowSeconds: number;
  rateBlockSeconds: number;
}>;

const SECRET_PATTERN = /^[\x21-\x7e]{32,256}$/;

function validApplicationOrigin(value: string | undefined, nodeEnvironment: string | undefined): URL | null {
  try {
    const origin = new URL(value ?? "");
    if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return null;
    if (origin.protocol === "https:") return origin;
    const loopback = origin.hostname === "127.0.0.1" || origin.hostname === "localhost";
    return origin.protocol === "http:" && loopback && nodeEnvironment !== "production" ? origin : null;
  } catch {
    return null;
  }
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!/^\d+$/.test(value ?? "")) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function isAdminFeatureEnabled(source: AdminEnvironmentSource = process.env): boolean {
  return source.MVH_ADMIN_ENABLED === "true";
}

export function getAdminSecurityConfig(source: AdminEnvironmentSource = process.env): AdminSecurityConfig | null {
  if (!isAdminFeatureEnabled(source)) return null;
  const csrfSecret = source.MVH_ADMIN_CSRF_SECRET?.trim() ?? "";
  const applicationOrigin = validApplicationOrigin(source.MVH_APPLICATION_ORIGIN, source.NODE_ENV);
  if (!SECRET_PATTERN.test(csrfSecret) || !applicationOrigin) return null;
  return Object.freeze({
    csrfSecret,
    applicationOrigin: applicationOrigin.origin,
    secureCookie: applicationOrigin.protocol === "https:",
    sessionMinutes: boundedInteger(source.MVH_ADMIN_SESSION_MINUTES, 15, 5, 30),
    loginMaxAttempts: 5,
    mfaMaxAttempts: 5,
    rateWindowSeconds: 300,
    rateBlockSeconds: 900
  });
}
