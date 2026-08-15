export const PRODUCTION_PLATFORM_ENVIRONMENT = "production-platform" as const;

export const PRODUCTION_PLATFORM_RESTRICTED_PREFIXES = [
  "/admin",
  "/assignments",
  "/classes",
  "/invitations",
  "/organization",
  "/pilot",
  "/student",
  "/teacher"
] as const;

export const PRODUCTION_PLATFORM_DEFERRED_BILLING_PREFIXES = [
  "/api/billing",
  "/billing",
  "/checkout"
] as const;

export const PRODUCTION_PLATFORM_AUTHENTICATED_PATHS = [
  "/account",
  "/game-access",
  "/play",
  "/subscription"
] as const;

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function validUrl(value: string | undefined): URL | null {
  try {
    const parsed = new URL(value ?? "");
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function exactPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProductionPlatformMode(source: EnvironmentSource = process.env): boolean {
  return source.MVH_APP_ENVIRONMENT === PRODUCTION_PLATFORM_ENVIRONMENT;
}

export function isProductionPlatformRestrictedPath(pathname: string, source: EnvironmentSource = process.env): boolean {
  if (source.MVH_ADMIN_ENABLED === "true" && exactPrefix(pathname, "/admin")) return false;
  return PRODUCTION_PLATFORM_RESTRICTED_PREFIXES.some((prefix) => exactPrefix(pathname, prefix));
}

export function isProductionPlatformDeferredBillingPath(pathname: string): boolean {
  return PRODUCTION_PLATFORM_DEFERRED_BILLING_PREFIXES.some((prefix) => exactPrefix(pathname, prefix));
}

export function isProductionPlatformAuthenticatedPath(pathname: string): boolean {
  return PRODUCTION_PLATFORM_AUTHENTICATED_PATHS.some((prefix) => exactPrefix(pathname, prefix));
}

export function hasProductionIdentityConfiguration(source: EnvironmentSource = process.env): boolean {
  const browserUrl = validUrl(source.NEXT_PUBLIC_SUPABASE_URL);
  const serverUrl = validUrl(source.SUPABASE_URL);
  const publishableKey = source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const secretKey = source.SUPABASE_SECRET_KEY?.trim() ?? "";
  const projectRef = source.MVH_SUPABASE_PROJECT_REF?.trim() ?? "";
  const productionRef = source.MVH_PRODUCTION_SUPABASE_PROJECT_REF?.trim() ?? "";
  if (!browserUrl || !serverUrl || browserUrl.origin !== serverUrl.origin || publishableKey.length < 20 || secretKey.length < 20) return false;
  if (!projectRef || projectRef !== productionRef) return false;
  const localAllowed = source.NODE_ENV !== "production" &&
    source.MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL === "true" &&
    ["127.0.0.1", "localhost"].includes(browserUrl.hostname);
  return localAllowed || (browserUrl.protocol === "https:" && browserUrl.hostname === `${projectRef}.supabase.co`);
}

export function hasPreviewCredentialCollision(source: EnvironmentSource = process.env): boolean {
  const projectRef = source.MVH_SUPABASE_PROJECT_REF?.trim() ?? "";
  const previewRef = source.MVH_PREVIEW_SUPABASE_PROJECT_REF?.trim() ?? "";
  if (!previewRef || !projectRef || previewRef === projectRef) return true;
  const comparisons = [
    ["NEXT_PUBLIC_SUPABASE_URL", "MVH_PREVIEW_SUPABASE_URL"],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "MVH_PREVIEW_SUPABASE_PUBLISHABLE_KEY"],
    ["SUPABASE_SECRET_KEY", "MVH_PREVIEW_SUPABASE_SECRET_KEY"]
  ] as const;
  return comparisons.some(([productionName, previewName]) => {
    const productionValue = source[productionName]?.trim();
    const previewValue = source[previewName]?.trim();
    return Boolean(productionValue && previewValue && productionValue === previewValue);
  });
}
