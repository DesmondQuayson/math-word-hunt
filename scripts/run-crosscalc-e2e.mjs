import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { cleanPlatformGeneratedNextState, registerVerificationNextProcess, stopVerificationNextProcess, waitForLocalSupabaseAuth } from "./verification-processes.mjs";

const cli = resolve("node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) if (typeof status[key] !== "string" || status[key].length < 10) throw new Error(`Local Supabase status is missing ${key}.`);
if (status.API_URL !== "http://127.0.0.1:55321") throw new Error("Native CrossCalc browser verification is local-only.");

const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
await waitForLocalSupabaseAuth(admin);
const identity = await admin.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
if (identity.error) throw identity.error;

const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_URL: status.API_URL, SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY, SUPABASE_SECRET_KEY: status.SECRET_KEY,
  APP_BASE_URL: "http://127.0.0.1:3000", MVH_APPLICATION_ORIGIN: "http://127.0.0.1:3000", MVH_SUBSCRIBER_MANAGEMENT_ORIGIN: "http://127.0.0.1:3000",
  MVH_APP_ENVIRONMENT: "production-platform", MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL: "true", MVH_IDENTITY_MODEL: "consumer-v1",
  MVH_SUPABASE_PROJECT_REF: "production-local", MVH_PRODUCTION_SUPABASE_PROJECT_REF: "production-local", MVH_PREVIEW_SUPABASE_PROJECT_REF: "preview-local",
  MVH_STRIPE_MODE: "test", MVH_FIXTURE_POLICY: "forbidden", MVH_BUILD_ID: "crosscalc-native-local", MVH_ADMIN_ENABLED: "true",
  MVH_ADMIN_CSRF_SECRET: "crosscalc-local-admin-csrf-secret", MVH_ADMIN_SESSION_MINUTES: "15", MVH_GAME_DELIVERY_SECRET: "crosscalc-local-delivery-secret-value",
  MVH_PILOT_STATE: "inactive", MVH_INVITATIONS_ENABLED: "false", MVH_EMAIL_DELIVERY: "local-capture", MVH_MONITORING_MODE: "console", MVH_DELETION_MODE: "dry-run",
  MVH_SUPPORT_EMAIL: "support@example.invalid", BILLING_ENABLED: "true", BILLING_PROVIDER: "fixture", BILLING_CHECKOUT_ENABLED: "true", BILLING_PORTAL_ENABLED: "true",
  BILLING_WEBHOOK_ENABLED: "true", BILLING_EMERGENCY_DEFAULT_DENY: "false", BILLING_RENEWAL_GRACE_DAYS: "7", BILLING_REFUND_REVIEW_DAYS: "7",
  BILLING_AUTOMATIC_REFUNDS: "false", BILLING_APP_BASE_URL: "http://127.0.0.1:3000", STRIPE_MODE: "test", STRIPE_API_VERSION: "2026-07-29.dahlia",
  STRIPE_PUBLISHABLE_KEY: "pk_test_fixture12345", STRIPE_SECRET_KEY: "sk_test_fixture12345", STRIPE_WEBHOOK_SECRET: "whsec_fixture12345",
  STRIPE_PRODUCT_MATHNEXA: "prod_mathnexa123", STRIPE_PRICE_MATHNEXA_MONTHLY: "price_mathnexa123", STRIPE_PORTAL_CONFIGURATION_ID: "bpc_mathnexa123"
};

await cleanPlatformGeneratedNextState();
const app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", resolve("apps/platform-web"), "--hostname", "127.0.0.1", "--port", "3000"], { env: environment, stdio: ["ignore", "inherit", "inherit"] });
registerVerificationNextProcess(app);
async function waitForApp() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw new Error("Native CrossCalc application exited before readiness.");
    try { const response = await fetch("http://127.0.0.1:3000/"); if (response.status < 500) return; } catch { /* Next is starting. */ }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error("Native CrossCalc application did not become ready.");
}

let exitCode = 1;
try {
  await waitForApp();
  const tests = spawn(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.crosscalc.config.mjs", ...process.argv.slice(2)], {
    env: { ...environment, SUPABASE_TEST_URL: status.API_URL, SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY }, stdio: "inherit"
  });
  [exitCode] = await once(tests, "exit");
} finally {
  await stopVerificationNextProcess(app);
  const restored = await admin.rpc("set_platform_identity_model", { p_identity_model: "legacy-preview" });
  if (restored.error) { console.error("Failed to restore the local Preview identity model.", restored.error.message); exitCode = 1; }
  try { execFileSync(process.execPath, [cli, "db", "reset", "--local"], { stdio: "inherit" }); }
  catch (error) { console.error("Failed to restore the local database after native CrossCalc verification.", error); exitCode = 1; }
}
process.exitCode = exitCode ?? 1;
