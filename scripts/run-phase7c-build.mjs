import { spawn } from "node:child_process";
import { once } from "node:events";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const environment = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://production-local.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_phase7c_build_placeholder",
  SUPABASE_URL: "https://production-local.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_phase7c_build_placeholder",
  SUPABASE_SECRET_KEY: "sb_secret_phase7c_build_server_only_placeholder",
  APP_BASE_URL: "https://platform.mathnexa.example",
  MVH_APP_ENVIRONMENT: "production-platform",
  MVH_APPLICATION_ORIGIN: "https://platform.mathnexa.example",
  MVH_IDENTITY_MODEL: "consumer-v1",
  MVH_SUPABASE_PROJECT_REF: "production-local",
  MVH_PRODUCTION_SUPABASE_PROJECT_REF: "production-local",
  MVH_PREVIEW_SUPABASE_PROJECT_REF: "preview-local",
  MVH_STRIPE_MODE: "test",
  MVH_EMAIL_DELIVERY: "transactional-configured",
  MVH_MONITORING_MODE: "console",
  MVH_FIXTURE_POLICY: "forbidden",
  MVH_DELETION_MODE: "dry-run",
  MVH_BUILD_ID: "phase7c-production-build",
  MVH_PILOT_STATE: "inactive",
  MVH_INVITATIONS_ENABLED: "false",
  BILLING_ENABLED: "true",
  BILLING_PROVIDER: "stripe",
  BILLING_CHECKOUT_ENABLED: "true",
  BILLING_PORTAL_ENABLED: "true",
  BILLING_WEBHOOK_ENABLED: "true",
  BILLING_EMERGENCY_DEFAULT_DENY: "false",
  BILLING_RENEWAL_GRACE_DAYS: "7",
  BILLING_REFUND_REVIEW_DAYS: "7",
  BILLING_AUTOMATIC_REFUNDS: "false",
  BILLING_APP_BASE_URL: "https://platform.mathnexa.example",
  STRIPE_MODE: "test",
  STRIPE_API_VERSION: "2026-02-25.clover",
  STRIPE_PUBLISHABLE_KEY: "pk_test_build12345",
  STRIPE_SECRET_KEY: "sk_test_build12345",
  STRIPE_WEBHOOK_SECRET: "whsec_build12345",
  STRIPE_PRODUCT_MATHNEXA: "prod_phase7cbuild",
  STRIPE_PRICE_MATHNEXA_MONTHLY: "price_phase7cbuild",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_phase7cbuild"
};

const build = spawn(npm, ["run", "build"], {
  env: environment,
  stdio: "inherit",
  shell: process.platform === "win32"
});
const [exitCode] = await once(build, "exit");
process.exitCode = exitCode ?? 1;
