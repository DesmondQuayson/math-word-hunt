import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { registerVerificationNextProcess, stopVerificationNextProcess } from "./verification-processes.mjs";

const status = JSON.parse(execFileSync(
  process.execPath,
  [resolve("node_modules/supabase/dist/supabase.js"), "status", "-o", "json"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
));
for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
  if (typeof status[key] !== "string" || status[key].length < 10) {
    throw new Error(`Local Supabase status is missing ${key}.`);
  }
}

const admin = createClient(status.API_URL, status.SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const mode = await admin.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
if (mode.error) throw mode.error;

const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  APP_BASE_URL: "http://127.0.0.1:3000",
  MVH_APP_ENVIRONMENT: "production-platform",
  MVH_APPLICATION_ORIGIN: "http://127.0.0.1:3000",
  MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL: "true",
  MVH_IDENTITY_MODEL: "consumer-v1",
  MVH_SUPABASE_PROJECT_REF: "production-local",
  MVH_PRODUCTION_SUPABASE_PROJECT_REF: "production-local",
  MVH_PREVIEW_SUPABASE_PROJECT_REF: "preview-local",
  MVH_STRIPE_MODE: "test",
  MVH_EMAIL_DELIVERY: "local-capture",
  MVH_MONITORING_MODE: "console",
  MVH_FIXTURE_POLICY: "forbidden",
  MVH_DELETION_MODE: "dry-run",
  MVH_BUILD_ID: "phase7c-local-sandbox",
  MVH_PILOT_STATE: "inactive",
  MVH_INVITATIONS_ENABLED: "false",
  BILLING_ENABLED: "true",
  BILLING_PROVIDER: "fixture",
  BILLING_CHECKOUT_ENABLED: "true",
  BILLING_PORTAL_ENABLED: "true",
  BILLING_WEBHOOK_ENABLED: "true",
  BILLING_EMERGENCY_DEFAULT_DENY: "false",
  BILLING_RENEWAL_GRACE_DAYS: "7",
  BILLING_REFUND_REVIEW_DAYS: "7",
  BILLING_AUTOMATIC_REFUNDS: "false",
  BILLING_APP_BASE_URL: "http://127.0.0.1:3000",
  STRIPE_MODE: "test",
  STRIPE_API_VERSION: "2026-07-29.dahlia",
  STRIPE_PUBLISHABLE_KEY: "pk_test_fixture12345",
  STRIPE_SECRET_KEY: "sk_test_fixture12345",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture12345",
  STRIPE_PRODUCT_MATHNEXA: "prod_mathnexa123",
  STRIPE_PRICE_MATHNEXA_MONTHLY: "price_mathnexa123",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_mathnexa123"
};

const app = spawn(
  process.execPath,
  [resolve("node_modules/next/dist/bin/next"), "dev", resolve("apps/platform-web"), "--hostname", "127.0.0.1", "--port", "3000"],
  { env: environment, stdio: ["ignore", "inherit", "inherit"] }
);
registerVerificationNextProcess(app);

async function waitFor(url) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // Next is still starting.
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error("Phase 7C local Sandbox rehearsal did not become ready.");
}

let exitCode = 1;
try {
  await waitFor("http://127.0.0.1:3000/");
  const tests = spawn(
    process.execPath,
    [resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.phase7c.config.mjs"],
    {
      env: {
        ...environment,
        SUPABASE_TEST_URL: status.API_URL,
        SUPABASE_TEST_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
        SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY
      },
      stdio: "inherit"
    }
  );
  [exitCode] = await once(tests, "exit");
} finally {
  await stopVerificationNextProcess(app);
  const restored = await admin.rpc("set_platform_identity_model", { p_identity_model: "legacy-preview" });
  if (restored.error) {
    console.error("Failed to restore the local Preview identity model.", restored.error.message);
    exitCode = 1;
  }
}
process.exitCode = exitCode ?? 1;
