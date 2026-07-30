export const PRODUCTION_PUBLIC_ENVIRONMENT = "production-public" as const;

const RESTRICTED_PROVIDER_VARIABLES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "MVH_SUPABASE_PROJECT_REF",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "VERCEL_AUTOMATION_BYPASS_SECRET"
] as const;

export const PRODUCTION_PUBLIC_RESTRICTED_PREFIXES = [
  "/account",
  "/api",
  "/auth",
  "/checkout",
  "/forgot-password",
  "/pilot",
  "/pricing",
  "/sign-in",
  "/sign-up",
  "/status",
  "/teacher",
  "/update-password"
] as const;

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export function isProductionPublicMode(source: EnvironmentSource = process.env): boolean {
  return source.MVH_APP_ENVIRONMENT === PRODUCTION_PUBLIC_ENVIRONMENT;
}

export function hasRestrictedProviderConfiguration(source: EnvironmentSource = process.env): boolean {
  return RESTRICTED_PROVIDER_VARIABLES.some((name) => Boolean(source[name]?.trim()));
}

export function isProductionPublicRestrictedPath(pathname: string): boolean {
  return PRODUCTION_PUBLIC_RESTRICTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function getProductionPublicConfigurationErrors(source: EnvironmentSource = process.env): readonly string[] {
  if (!isProductionPublicMode(source)) return Object.freeze([]);
  const errors: string[] = [];
  if (hasRestrictedProviderConfiguration(source)) errors.push("restricted-provider-configuration");
  if (source.BILLING_ENABLED !== "false") errors.push("billing-not-disabled");
  if (source.MVH_PILOT_STATE !== "inactive") errors.push("pilot-not-inactive");
  if (source.MVH_INVITATIONS_ENABLED !== "false") errors.push("invitations-not-disabled");
  return Object.freeze(errors);
}
