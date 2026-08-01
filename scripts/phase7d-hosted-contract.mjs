export const PHASE7D_BASELINE = "5b558ece7ca6ee902e2f1c6d257e3591a26ef8fa";
export const PHASE7D_SUPABASE_PROJECT_NAME = "mathnexa-platform-staging";
export const PHASE7D_SUPABASE_ORGANIZATION_ID = "mtavaeztjyxasjeovfka";
export const PHASE7D_SUPABASE_REGION = "us-east-2";
export const PHASE7D_VERCEL_PROJECT_NAME = "mathnexa-platform-staging";
export const PHASE7D_VERCEL_SCOPE = "bright-path-ed-tech";
export const PHASE7D_VERCEL_TEAM_ID = "team_qhdZ6TvnEA6BYjjfAiwJBAp9";
export const PHASE7D_STAGING_ORIGIN =
  "https://mathnexa-platform-staging-desmondquayson-bright-path-ed-tech.vercel.app";
export const PHASE7D_PREVIEW_SUPABASE_REF = "ioodoktlxvvmghyvevgn";
export const PHASE7D_RESEND_DOMAIN = "auth.mathnexa.com";
export const PHASE7D_RESEND_SENDER = "no-reply@auth.mathnexa.com";
export const PHASE7D_RESEND_TEST_RECIPIENT = "delivered@resend.dev";
export const PHASE7D_STRIPE_PRODUCT_ID = "prod_UzJVhdFFd8lNed";
export const PHASE7D_STRIPE_PRICE_ID = "price_1TzKso4YQNsZa1pjh5UZvcV7";
export const PHASE7D_STRIPE_PORTAL_ID = "bpc_1TzLQf4YQNsZa1pjhn4FayQy";
export const PHASE7D_STRIPE_API_VERSION = "2026-07-29.dahlia";
export const PHASE7D_TRIAL_SECONDS = 86_400;
export const PHASE7D_RENEWAL_GRACE_DAYS = 7;

const VERCEL_STANDARD_PROTECTION_SCOPES = new Set([
  "all_except_custom_domains",
  "prod_deployment_urls_and_all_previews"
]);

export const PHASE7D_PROTECTED_HASHES = Object.freeze({
  "docs/index.html": "10D0E49CD5DECF316615A10F6BDE37DC89796B2D8817EB1CF5D9EE25D263747E",
  "docs/vocab.js": "CAEB8FBB590FFFD8CBC169F88F174A38C26DE2D16A7E1B0C1CF5E83AC9F01C46"
});

export const PHASE7D_STRIPE_EVENTS = Object.freeze([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.deleted"
]);

export const PHASE7D_FORBIDDEN_DATA_TABLES = Object.freeze([
  "teacher_profiles",
  "teacher_classes",
  "teacher_activities"
]);

export const PHASE7D_SYNTHETIC_TABLES = Object.freeze([
  "consumer_accounts",
  "consumer_game_entitlements",
  "consumer_deletion_requests",
  "billing_customers",
  "billing_subscriptions",
  "billing_webhook_events",
  ...PHASE7D_FORBIDDEN_DATA_TABLES
]);

export const PHASE7D_SECRET_NAMES = Object.freeze([
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "RESEND_API_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "VERCEL_AUTOMATION_BYPASS_SECRET"
]);

export function buildPhase7dEnvironment(input) {
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: input.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: input.supabasePublishableKey,
    SUPABASE_URL: input.supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: input.supabasePublishableKey,
    SUPABASE_SECRET_KEY: input.supabaseSecretKey,
    APP_BASE_URL: PHASE7D_STAGING_ORIGIN,
    MVH_APP_ENVIRONMENT: "production-platform",
    MVH_APPLICATION_ORIGIN: PHASE7D_STAGING_ORIGIN,
    MVH_IDENTITY_MODEL: "consumer-v1",
    MVH_SUPABASE_PROJECT_REF: input.supabaseProjectRef,
    MVH_PRODUCTION_SUPABASE_PROJECT_REF: input.supabaseProjectRef,
    MVH_PREVIEW_SUPABASE_PROJECT_REF: PHASE7D_PREVIEW_SUPABASE_REF,
    MVH_STRIPE_MODE: "test",
    MVH_EMAIL_DELIVERY: input.emailVerified ? "transactional-verified" : "transactional-configured",
    MVH_MONITORING_MODE: "console",
    MVH_FIXTURE_POLICY: "forbidden",
    MVH_DELETION_MODE: "dry-run",
    MVH_BUILD_ID: input.buildId,
    MVH_PILOT_STATE: "inactive",
    MVH_INVITATIONS_ENABLED: "false",
    BILLING_ENABLED: "true",
    BILLING_ENVIRONMENT: "preview",
    BILLING_PROVIDER: "stripe",
    STRIPE_MODE: "test",
    STRIPE_API_VERSION: PHASE7D_STRIPE_API_VERSION,
    STRIPE_PUBLISHABLE_KEY: input.stripePublishableKey,
    STRIPE_SECRET_KEY: input.stripeSecretKey,
    STRIPE_WEBHOOK_SECRET: input.stripeWebhookSecret,
    STRIPE_PRODUCT_MATHNEXA: PHASE7D_STRIPE_PRODUCT_ID,
    STRIPE_PRICE_MATHNEXA_MONTHLY: PHASE7D_STRIPE_PRICE_ID,
    STRIPE_PORTAL_CONFIGURATION_ID: PHASE7D_STRIPE_PORTAL_ID,
    BILLING_APP_BASE_URL: PHASE7D_STAGING_ORIGIN,
    BILLING_CHECKOUT_ENABLED: "true",
    BILLING_PORTAL_ENABLED: "true",
    BILLING_WEBHOOK_ENABLED: "true",
    BILLING_EMERGENCY_DEFAULT_DENY: "false",
    BILLING_RENEWAL_GRACE_DAYS: String(PHASE7D_RENEWAL_GRACE_DAYS),
    BILLING_REFUND_REVIEW_DAYS: "7",
    BILLING_AUTOMATIC_REFUNDS: "false"
  };
  return Object.freeze(values);
}

export function redactPhase7dText(value, secrets = []) {
  let output = String(value ?? "");
  for (const secret of secrets.filter(Boolean)) output = output.replaceAll(secret, "[REDACTED]");
  return output
    .replaceAll(/(?:sbp|re|pk_test|sk_test|whsec)_[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replaceAll(/x-vercel-protection-bypass=[^&\s"]+/g, "x-vercel-protection-bypass=[REDACTED]")
    .slice(-8_000);
}

export function isSafePhase7dOrigin(value) {
  return value === PHASE7D_STAGING_ORIGIN && value !== "https://mathnexa.com";
}

export function isVercelStandardProtectionScope(value) {
  return VERCEL_STANDARD_PROTECTION_SCOPES.has(value);
}
