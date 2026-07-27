import "server-only";

export type BillingApplicationEnvironment = "local" | "test" | "preview" | "production";
export type StripeMode = "test" | "live";
export type BillingProvider = "stripe" | "fixture";
export const STRIPE_API_VERSION = "2026-02-25.clover" as const;

export type BillingConfiguration = Readonly<
  | { enabled: false; applicationEnvironment: BillingApplicationEnvironment }
  | {
      enabled: true;
      applicationEnvironment: BillingApplicationEnvironment;
      provider: BillingProvider;
      stripeMode: StripeMode;
      apiVersion: typeof STRIPE_API_VERSION;
      publishableKey: string;
      secretKey: string;
      webhookSecret: string;
      productId: string;
      portalConfigurationId: string;
      priceIds: Readonly<{
        "teacher-pro-monthly": string;
        "teacher-pro-annual": string;
      }>;
      applicationBaseUrl: string;
      checkoutEnabled: boolean;
      portalEnabled: boolean;
      webhookEnabled: boolean;
      emergencyDefaultDeny: boolean;
    }
>;

export class BillingConfigurationError extends Error {
  constructor(public readonly code: string) {
    super(`Billing configuration rejected (${code})`);
    this.name = "BillingConfigurationError";
  }
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function required(source: EnvironmentSource, name: string): string {
  const value = source[name]?.trim() ?? "";
  if (!value) throw new BillingConfigurationError(`missing-${name.toLowerCase().replaceAll("_", "-")}`);
  return value;
}

function parseApplicationEnvironment(value: string | undefined): BillingApplicationEnvironment {
  if (value === "local" || value === "test" || value === "preview" || value === "production") return value;
  throw new BillingConfigurationError("invalid-application-environment");
}

function validateKey(value: string, kind: "publishable" | "secret", mode: StripeMode): void {
  const prefix = kind === "publishable" ? `pk_${mode}_` : `sk_${mode}_`;
  if (!value.startsWith(prefix) || !new RegExp(`^${prefix}[A-Za-z0-9]{8,}$`).test(value)) {
    throw new BillingConfigurationError(`${kind}-key-mode-or-format`);
  }
}

function validateProviderId(value: string, prefix: "prod" | "price" | "bpc", code: string): void {
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]{6,}$`).test(value)) throw new BillingConfigurationError(code);
}

function strictBoolean(source: EnvironmentSource, name: string): boolean {
  const value = required(source, name);
  if (value !== "true" && value !== "false") throw new BillingConfigurationError(`invalid-${name.toLowerCase().replaceAll("_", "-")}`);
  return value === "true";
}

function validateBaseUrl(value: string, environment: BillingApplicationEnvironment): string {
  try {
    const url = new URL(value);
    const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    const safeProtocol = url.protocol === "https:" ||
      ((environment === "local" || environment === "test") && url.protocol === "http:" && localHost);
    if (!safeProtocol || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("unsafe");
    }
    return url.origin;
  } catch {
    throw new BillingConfigurationError("unsafe-application-base-url");
  }
}

export function parseBillingConfiguration(source: EnvironmentSource): BillingConfiguration {
  const applicationEnvironment = parseApplicationEnvironment(source.BILLING_ENVIRONMENT?.trim());
  const enabled = source.BILLING_ENABLED?.trim() === "true";
  if (!enabled) {
    if (source.BILLING_ENABLED?.trim() !== "false") throw new BillingConfigurationError("invalid-enabled-flag");
    return Object.freeze({ enabled: false, applicationEnvironment });
  }

  const stripeMode = required(source, "STRIPE_MODE");
  if (stripeMode !== "test" && stripeMode !== "live") throw new BillingConfigurationError("invalid-stripe-mode");
  const expectedMode: StripeMode = applicationEnvironment === "production" ? "live" : "test";
  if (stripeMode !== expectedMode) throw new BillingConfigurationError("environment-mode-mismatch");
  if (applicationEnvironment === "production" && source.BILLING_LIVE_ACTIVATION?.trim() !== "owner-approved") {
    throw new BillingConfigurationError("production-not-owner-approved");
  }
  const provider = required(source, "BILLING_PROVIDER");
  if (provider !== "stripe" && provider !== "fixture") throw new BillingConfigurationError("invalid-billing-provider");
  if (provider === "fixture" && applicationEnvironment !== "local" && applicationEnvironment !== "test") {
    throw new BillingConfigurationError("fixture-provider-environment");
  }
  const apiVersion = required(source, "STRIPE_API_VERSION");
  if (apiVersion !== STRIPE_API_VERSION) throw new BillingConfigurationError("stripe-api-version-mismatch");

  const publishableKey = required(source, "STRIPE_PUBLISHABLE_KEY");
  const secretKey = required(source, "STRIPE_SECRET_KEY");
  const webhookSecret = required(source, "STRIPE_WEBHOOK_SECRET");
  validateKey(publishableKey, "publishable", stripeMode);
  validateKey(secretKey, "secret", stripeMode);
  if (!/^whsec_[A-Za-z0-9]{8,}$/.test(webhookSecret)) throw new BillingConfigurationError("webhook-secret-format");

  const productId = required(source, "STRIPE_PRODUCT_TEACHER_PRO");
  const monthlyPriceId = required(source, "STRIPE_PRICE_TEACHER_PRO_MONTHLY");
  const annualPriceId = required(source, "STRIPE_PRICE_TEACHER_PRO_ANNUAL");
  const portalConfigurationId = required(source, "STRIPE_PORTAL_CONFIGURATION_ID");
  validateProviderId(productId, "prod", "product-id-format");
  validateProviderId(monthlyPriceId, "price", "monthly-price-id-format");
  validateProviderId(annualPriceId, "price", "annual-price-id-format");
  validateProviderId(portalConfigurationId, "bpc", "portal-configuration-id-format");
  if (monthlyPriceId === annualPriceId) throw new BillingConfigurationError("duplicate-plan-mapping");

  return Object.freeze({
    enabled: true,
    applicationEnvironment,
    provider,
    stripeMode,
    apiVersion: STRIPE_API_VERSION,
    publishableKey,
    secretKey,
    webhookSecret,
    productId,
    portalConfigurationId,
    priceIds: Object.freeze({
      "teacher-pro-monthly": monthlyPriceId,
      "teacher-pro-annual": annualPriceId
    }),
    applicationBaseUrl: validateBaseUrl(required(source, "BILLING_APP_BASE_URL"), applicationEnvironment),
    checkoutEnabled: strictBoolean(source, "BILLING_CHECKOUT_ENABLED"),
    portalEnabled: strictBoolean(source, "BILLING_PORTAL_ENABLED"),
    webhookEnabled: strictBoolean(source, "BILLING_WEBHOOK_ENABLED"),
    emergencyDefaultDeny: strictBoolean(source, "BILLING_EMERGENCY_DEFAULT_DENY")
  });
}

export function getBillingConfiguration(): BillingConfiguration {
  return parseBillingConfiguration(process.env);
}

export function tryGetBillingConfiguration(): BillingConfiguration | null {
  try { return getBillingConfiguration(); } catch { return null; }
}
