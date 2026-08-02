import { spawn } from "node:child_process";
import { once } from "node:events";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const environment = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://phase7e-production.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_phase7e_build_placeholder",
  SUPABASE_URL: "https://phase7e-production.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_phase7e_build_placeholder",
  SUPABASE_SECRET_KEY: "sb_secret_phase7e_build_server_only_placeholder",
  APP_BASE_URL: "https://mathnexa.com",
  MVH_APP_ENVIRONMENT: "production-platform",
  MVH_APPLICATION_ORIGIN: "https://mathnexa.com",
  MVH_SUBSCRIBER_MANAGEMENT_ORIGIN: "https://mathnexa-production.vercel.app",
  MVH_IDENTITY_MODEL: "consumer-v1",
  MVH_SUPABASE_PROJECT_REF: "phase7e-production",
  MVH_PRODUCTION_SUPABASE_PROJECT_REF: "phase7e-production",
  MVH_PREVIEW_SUPABASE_PROJECT_REF: "phase7e-preview",
  MVH_STRIPE_MODE: "live",
  MVH_COMMERCIAL_ACTIVATION: "live",
  MVH_EMAIL_DELIVERY: "transactional-verified",
  MVH_MONITORING_MODE: "console",
  MVH_FIXTURE_POLICY: "forbidden",
  MVH_DELETION_MODE: "dry-run",
  MVH_BUILD_ID: "phase7e-live-contract-build",
  MVH_PILOT_STATE: "inactive",
  MVH_INVITATIONS_ENABLED: "false",
  MVH_LEGAL_REVIEW: "owner-approved",
  MVH_TERMS_VERSION: "2026-08-01",
  MVH_PRIVACY_VERSION: "2026-08-01",
  MVH_CANCELLATION_POLICY_VERSION: "2026-08-01",
  MVH_REFUND_POLICY_VERSION: "2026-08-01",
  MVH_SUPPORT_EMAIL: "support@example.invalid",
  BILLING_ENABLED: "true",
  BILLING_PROVIDER: "stripe",
  BILLING_LIVE_ACTIVATION: "owner-approved",
  BILLING_CHECKOUT_ENABLED: "false",
  BILLING_PORTAL_ENABLED: "true",
  BILLING_WEBHOOK_ENABLED: "true",
  BILLING_EMERGENCY_DEFAULT_DENY: "false",
  BILLING_RENEWAL_GRACE_DAYS: "7",
  BILLING_REFUND_REVIEW_DAYS: "7",
  BILLING_AUTOMATIC_REFUNDS: "false",
  BILLING_APP_BASE_URL: "https://mathnexa.com",
  STRIPE_MODE: "live",
  STRIPE_API_VERSION: "2026-07-29.dahlia",
  STRIPE_PUBLISHABLE_KEY: "pk_live_phase7ebuild12345",
  STRIPE_SECRET_KEY: "sk_live_phase7ebuild12345",
  STRIPE_WEBHOOK_SECRET: "whsec_phase7ebuild12345",
  STRIPE_PRODUCT_MATHNEXA: "prod_phase7ebuild",
  STRIPE_PRICE_MATHNEXA_MONTHLY: "price_phase7ebuild",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_phase7ebuild"
};

const build = spawn(npm, ["run", "build"], { env: environment, stdio: "inherit", shell: process.platform === "win32" });
const [exitCode] = await once(build, "exit");
process.exitCode = exitCode ?? 1;
