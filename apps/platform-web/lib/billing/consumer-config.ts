import "server-only";

import { STRIPE_API_VERSION } from "./config";
import { COMMERCIAL_POLICY } from "@/lib/commercial/policy";
import { getSupportEmail } from "@/lib/commercial/support";

export type ConsumerBillingConfiguration = Readonly<{
  enabled: true;
  provider: "stripe" | "fixture";
  stripeMode: "test" | "live";
  commercialActivation: "rehearsal" | "live";
  apiVersion: typeof STRIPE_API_VERSION;
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
  productId: string;
  priceId: string;
  portalConfigurationId: string;
  applicationBaseUrl: string;
  subscriberManagementBaseUrl: string;
  checkoutEnabled: boolean;
  portalEnabled: boolean;
  webhookEnabled: boolean;
  emergencyDefaultDeny: boolean;
  renewalGraceDays: number;
  refundReviewDays: number;
  automaticRefunds: false;
  supportEmail: string | null;
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

function checkoutFlag(source: Source): boolean {
  const value = source.BILLING_CHECKOUT_ENABLED?.trim();
  if (!value) return false;
  if (value !== "true" && value !== "false") {
    throw new ConsumerBillingConfigurationError("invalid-billing-checkout-enabled");
  }
  return value === "true";
}

export function parseConsumerBillingConfiguration(source: Source): ConsumerBillingConfiguration {
  if (source.MVH_APP_ENVIRONMENT !== "production-platform") throw new ConsumerBillingConfigurationError("wrong-application-environment");
  if (source.BILLING_ENABLED !== "true") throw new ConsumerBillingConfigurationError("billing-disabled");
  const stripeMode = required(source, "STRIPE_MODE");
  const applicationStripeMode = required(source, "MVH_STRIPE_MODE");
  if ((stripeMode !== "test" && stripeMode !== "live") || applicationStripeMode !== stripeMode) {
    throw new ConsumerBillingConfigurationError("stripe-mode-mismatch");
  }
  const provider = required(source, "BILLING_PROVIDER");
  if (provider !== "stripe" && provider !== "fixture") throw new ConsumerBillingConfigurationError("invalid-provider");
  const localRehearsal = source.MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL === "true";
  if (provider === "fixture" && (!localRehearsal || stripeMode !== "test")) {
    throw new ConsumerBillingConfigurationError("fixture-local-only");
  }
  if (required(source, "STRIPE_API_VERSION") !== STRIPE_API_VERSION) throw new ConsumerBillingConfigurationError("stripe-api-version-mismatch");

  const publishableKey = required(source, "STRIPE_PUBLISHABLE_KEY");
  const secretKey = required(source, "STRIPE_SECRET_KEY");
  const webhookSecret = required(source, "STRIPE_WEBHOOK_SECRET");
  if (!new RegExp(`^pk_${stripeMode}_[A-Za-z0-9]{8,}$`).test(publishableKey)) throw new ConsumerBillingConfigurationError("publishable-key-mode-or-format");
  if (!new RegExp(`^sk_${stripeMode}_[A-Za-z0-9]{8,}$`).test(secretKey)) throw new ConsumerBillingConfigurationError("secret-key-mode-or-format");
  if (!/^whsec_[A-Za-z0-9]{8,}$/.test(webhookSecret)) throw new ConsumerBillingConfigurationError("webhook-secret-format");
  if (source.BILLING_AUTOMATIC_REFUNDS !== "false") throw new ConsumerBillingConfigurationError("automatic-refunds-prohibited");

  const applicationBaseUrl = baseUrl(required(source, "BILLING_APP_BASE_URL"), localRehearsal);
  const subscriberManagementBaseUrl = baseUrl(
    source.MVH_SUBSCRIBER_MANAGEMENT_ORIGIN?.trim() || applicationBaseUrl,
    localRehearsal
  );
  const commercialActivation = stripeMode === "live" ? "live" : "rehearsal";
  const supportEmail = getSupportEmail(source);
  if (stripeMode === "live") {
    if (source.MVH_COMMERCIAL_ACTIVATION !== "live" || source.BILLING_LIVE_ACTIVATION !== "owner-approved") {
      throw new ConsumerBillingConfigurationError("live-commercial-activation-not-approved");
    }
    if (source.MVH_EMAIL_DELIVERY !== "transactional-verified" || source.MVH_FIXTURE_POLICY !== "forbidden" ||
      source.MVH_IDENTITY_MODEL !== "consumer-v1" || applicationBaseUrl !== "https://mathnexa.com" ||
      source.MVH_APPLICATION_ORIGIN !== "https://mathnexa.com" ||
      source.MVH_LEGAL_REVIEW !== "owner-approved" || !supportEmail ||
      source.MVH_TERMS_VERSION !== COMMERCIAL_POLICY.termsVersion ||
      source.MVH_PRIVACY_VERSION !== COMMERCIAL_POLICY.privacyVersion ||
      source.MVH_CANCELLATION_POLICY_VERSION !== COMMERCIAL_POLICY.cancellationVersion ||
      source.MVH_REFUND_POLICY_VERSION !== COMMERCIAL_POLICY.refundVersion) {
      throw new ConsumerBillingConfigurationError("live-production-prerequisites-incomplete");
    }
    const management = new URL(subscriberManagementBaseUrl);
    if (!management.hostname.endsWith(".vercel.app")) {
      throw new ConsumerBillingConfigurationError("stable-subscriber-management-origin-required");
    }
  } else if (source.MVH_COMMERCIAL_ACTIVATION === "live" || source.BILLING_LIVE_ACTIVATION === "owner-approved") {
    throw new ConsumerBillingConfigurationError("test-mode-live-activation-conflict");
  }

  return Object.freeze({
    enabled: true,
    provider,
    stripeMode,
    commercialActivation,
    apiVersion: STRIPE_API_VERSION,
    publishableKey,
    secretKey,
    webhookSecret,
    productId: providerId(required(source, "STRIPE_PRODUCT_MATHNEXA"), "prod", "product-id-format"),
    priceId: providerId(required(source, "STRIPE_PRICE_MATHNEXA_MONTHLY"), "price", "price-id-format"),
    portalConfigurationId: providerId(required(source, "STRIPE_PORTAL_CONFIGURATION_ID"), "bpc", "portal-id-format"),
    applicationBaseUrl,
    subscriberManagementBaseUrl,
    checkoutEnabled: checkoutFlag(source),
    portalEnabled: flag(source, "BILLING_PORTAL_ENABLED"),
    webhookEnabled: flag(source, "BILLING_WEBHOOK_ENABLED"),
    emergencyDefaultDeny: flag(source, "BILLING_EMERGENCY_DEFAULT_DENY"),
    renewalGraceDays: integer(source, "BILLING_RENEWAL_GRACE_DAYS", 1, 30),
    refundReviewDays: integer(source, "BILLING_REFUND_REVIEW_DAYS", 1, 30),
    automaticRefunds: false,
    supportEmail
  });
}

export function tryGetConsumerBillingConfiguration(source: Source = process.env): ConsumerBillingConfiguration | null {
  try {
    return parseConsumerBillingConfiguration(source);
  } catch {
    return null;
  }
}
