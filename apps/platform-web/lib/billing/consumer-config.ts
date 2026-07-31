import "server-only";

import { STRIPE_API_VERSION } from "./config";

export type ConsumerBillingConfiguration = Readonly<{
  enabled: true;
  provider: "stripe" | "fixture";
  stripeMode: "test";
  apiVersion: typeof STRIPE_API_VERSION;
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
  productId: string;
  priceId: string;
  portalConfigurationId: string;
  applicationBaseUrl: string;
  checkoutEnabled: boolean;
  portalEnabled: boolean;
  webhookEnabled: boolean;
  emergencyDefaultDeny: boolean;
  renewalGraceDays: number;
  refundReviewDays: number;
  automaticRefunds: false;
}>;

export class ConsumerBillingConfigurationError extends Error {
  constructor(public readonly code: string) {
    super(`Consumer billing configuration rejected (${code})`);
    this.name = "ConsumerBillingConfigurationError";
  }
}

type Source = Readonly<Record<string, string | undefined>>;

function required(source: Source, name: string): string {
  const value = source[name]?.trim() ?? "";
  if (!value) throw new ConsumerBillingConfigurationError(`missing-${name.toLowerCase().replaceAll("_", "-")}`);
  return value;
}

function flag(source: Source, name: string): boolean {
  const value = required(source, name);
  if (value !== "true" && value !== "false") throw new ConsumerBillingConfigurationError(`invalid-${name.toLowerCase().replaceAll("_", "-")}`);
  return value === "true";
}

function integer(source: Source, name: string, minimum: number, maximum: number): number {
  const value = Number(required(source, name));
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ConsumerBillingConfigurationError(`invalid-${name.toLowerCase().replaceAll("_", "-")}`);
  }
  return value;
}

function providerId(value: string, prefix: "prod" | "price" | "bpc", code: string): string {
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]{6,}$`).test(value)) throw new ConsumerBillingConfigurationError(code);
  return value;
}

function baseUrl(value: string, localRehearsal: boolean): string {
  try {
    const url = new URL(value);
    const loopback = ["127.0.0.1", "localhost"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(localRehearsal && loopback && url.protocol === "http:")) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("unsafe");
    return url.origin;
  } catch {
    throw new ConsumerBillingConfigurationError("unsafe-application-base-url");
  }
}

export function parseConsumerBillingConfiguration(source: Source): ConsumerBillingConfiguration {
  if (source.MVH_APP_ENVIRONMENT !== "production-platform") throw new ConsumerBillingConfigurationError("wrong-application-environment");
  if (source.BILLING_ENABLED !== "true") throw new ConsumerBillingConfigurationError("billing-disabled");
  if (required(source, "STRIPE_MODE") !== "test" || required(source, "MVH_STRIPE_MODE") !== "test") {
    throw new ConsumerBillingConfigurationError("sandbox-mode-required");
  }
  const provider = required(source, "BILLING_PROVIDER");
  if (provider !== "stripe" && provider !== "fixture") throw new ConsumerBillingConfigurationError("invalid-provider");
  const localRehearsal = source.MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL === "true";
  if (provider === "fixture" && !localRehearsal) throw new ConsumerBillingConfigurationError("fixture-local-only");
  if (required(source, "STRIPE_API_VERSION") !== STRIPE_API_VERSION) throw new ConsumerBillingConfigurationError("stripe-api-version-mismatch");

  const publishableKey = required(source, "STRIPE_PUBLISHABLE_KEY");
  const secretKey = required(source, "STRIPE_SECRET_KEY");
  const webhookSecret = required(source, "STRIPE_WEBHOOK_SECRET");
  if (!/^pk_test_[A-Za-z0-9]{8,}$/.test(publishableKey)) throw new ConsumerBillingConfigurationError("publishable-key-format");
  if (!/^sk_test_[A-Za-z0-9]{8,}$/.test(secretKey)) throw new ConsumerBillingConfigurationError("secret-key-format");
  if (!/^whsec_[A-Za-z0-9]{8,}$/.test(webhookSecret)) throw new ConsumerBillingConfigurationError("webhook-secret-format");
  if (source.BILLING_AUTOMATIC_REFUNDS !== "false") throw new ConsumerBillingConfigurationError("automatic-refunds-prohibited");

  return Object.freeze({
    enabled: true,
    provider,
    stripeMode: "test",
    apiVersion: STRIPE_API_VERSION,
    publishableKey,
    secretKey,
    webhookSecret,
    productId: providerId(required(source, "STRIPE_PRODUCT_MATHNEXA"), "prod", "product-id-format"),
    priceId: providerId(required(source, "STRIPE_PRICE_MATHNEXA_MONTHLY"), "price", "price-id-format"),
    portalConfigurationId: providerId(required(source, "STRIPE_PORTAL_CONFIGURATION_ID"), "bpc", "portal-id-format"),
    applicationBaseUrl: baseUrl(required(source, "BILLING_APP_BASE_URL"), localRehearsal),
    checkoutEnabled: flag(source, "BILLING_CHECKOUT_ENABLED"),
    portalEnabled: flag(source, "BILLING_PORTAL_ENABLED"),
    webhookEnabled: flag(source, "BILLING_WEBHOOK_ENABLED"),
    emergencyDefaultDeny: flag(source, "BILLING_EMERGENCY_DEFAULT_DENY"),
    renewalGraceDays: integer(source, "BILLING_RENEWAL_GRACE_DAYS", 1, 30),
    refundReviewDays: integer(source, "BILLING_REFUND_REVIEW_DAYS", 1, 30),
    automaticRefunds: false
  });
}

export function tryGetConsumerBillingConfiguration(source: Source = process.env): ConsumerBillingConfiguration | null {
  try {
    return parseConsumerBillingConfiguration(source);
  } catch {
    return null;
  }
}
