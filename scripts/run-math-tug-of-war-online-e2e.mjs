/**
 * Math Tug of War — Online Match certification with two real browsers.
 *
 * Boots the platform (production-platform rehearsal) against LOCAL Supabase,
 * then runs e2e/math-tug-of-war/online.spec.ts, which signs in two synthetic
 * subscribers in separate browser contexts and plays real matches through the
 * real API and database functions. Synthetic users are deleted afterwards and
 * the local identity model is restored. Local-only by construction.
 *
 *   node scripts/run-math-tug-of-war-online-e2e.mjs
 */
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  cleanPlatformGeneratedNextState,
  registerVerificationNextProcess,
  stopVerificationNextProcess,
  waitForLocalSupabaseAuth
} from "./verification-processes.mjs";

const cli = resolve("node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "-o", "json"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"]
}));
for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
  if (typeof status[key] !== "string" || status[key].length < 10) throw new Error(`Local Supabase status is missing ${key}.`);
}
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(status.API_URL)) throw new Error("Math Tug of War online verification is local-only.");
// The sign-up test reads its confirmation email from the stack's own local mail capture.
const mailUrl = status.MAILPIT_URL ?? status.INBUCKET_URL;
if (typeof mailUrl !== "string" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(mailUrl)) throw new Error("Local Supabase status is missing its local mail capture URL.");

const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
await waitForLocalSupabaseAuth(admin);
const catalog = await admin.from("game_catalog_entries").select("status").eq("stable_key", "math-tug-of-war").maybeSingle();
if (catalog.error || catalog.data?.status !== "published") {
  throw new Error("Apply supabase/migrations/20260927100000_math_tug_of_war.sql to local Supabase first.");
}
const identity = await admin.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
if (identity.error) throw identity.error;

const port = Number(process.env.MATH_TUG_OF_WAR_APP_PORT ?? 3000);
const origin = `http://127.0.0.1:${port}`;
const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  APP_BASE_URL: origin,
  MVH_APPLICATION_ORIGIN: origin,
  MVH_SUBSCRIBER_MANAGEMENT_ORIGIN: origin,
  MVH_APP_ENVIRONMENT: "production-platform",
  MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL: "true",
  MVH_IDENTITY_MODEL: "consumer-v1",
  MVH_SUPABASE_PROJECT_REF: "production-local",
  MVH_PRODUCTION_SUPABASE_PROJECT_REF: "production-local",
  MVH_PREVIEW_SUPABASE_PROJECT_REF: "preview-local",
  MVH_STRIPE_MODE: "test",
  MVH_FIXTURE_POLICY: "forbidden",
  MVH_BUILD_ID: "math-tug-of-war-online-local",
  MVH_ADMIN_ENABLED: "true",
  MVH_ADMIN_SESSION_MINUTES: "15",
  MVH_ADMIN_CSRF_SECRET: "math-tug-of-war-local-admin-csrf-secret",
  MVH_GAME_DELIVERY_SECRET: "math-tug-of-war-local-delivery-secret-value",
  MVH_PILOT_STATE: "inactive",
  MVH_INVITATIONS_ENABLED: "false",
  MVH_EMAIL_DELIVERY: "local-capture",
  MVH_MONITORING_MODE: "console",
  MVH_DELETION_MODE: "dry-run",
  MVH_SUPPORT_EMAIL: "support@example.invalid",
  BILLING_ENABLED: "true",
  BILLING_PROVIDER: "fixture",
  BILLING_CHECKOUT_ENABLED: "true",
  BILLING_PORTAL_ENABLED: "true",
  BILLING_WEBHOOK_ENABLED: "true",
  BILLING_EMERGENCY_DEFAULT_DENY: "false",
  BILLING_RENEWAL_GRACE_DAYS: "7",
  BILLING_REFUND_REVIEW_DAYS: "7",
  BILLING_AUTOMATIC_REFUNDS: "false",
  BILLING_APP_BASE_URL: origin,
  STRIPE_MODE: "test",
  STRIPE_API_VERSION: "2026-07-29.dahlia",
  STRIPE_PUBLISHABLE_KEY: "pk_test_fixture12345",
  STRIPE_SECRET_KEY: "sk_test_fixture12345",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture12345",
  STRIPE_PRODUCT_MATHNEXA: "prod_mathnexa123",
  STRIPE_PRICE_MATHNEXA_MONTHLY: "price_mathnexa123",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_mathnexa123"
};

await cleanPlatformGeneratedNextState();
const app = spawn(process.execPath, [
  resolve("node_modules/next/dist/bin/next"), "dev", resolve("apps/platform-web"),
  "--hostname", "127.0.0.1", "--port", String(port)
], { env: environment, stdio: ["ignore", "inherit", "inherit"] });
registerVerificationNextProcess(app);

async function waitForApp() {
  const deadline = Date.now() + 90_000;
  let lastStatus = "no response";
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw new Error("Application exited before readiness.");
    try {
      const response = await fetch(`${origin}/`);
      lastStatus = String(response.status);
      if (response.status < 500) return;
    } catch {
      // Next is still starting.
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`Application did not become ready (last status: ${lastStatus}).`);
}

let exitCode = 1;
try {
  await waitForApp();
  const tests = spawn(process.execPath, [
    resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.math-tug-of-war-online.config.mjs",
    ...process.argv.slice(2)
  ], {
    env: { ...environment, MATH_TUG_OF_WAR_ONLINE_URL: origin, SUPABASE_TEST_URL: status.API_URL, SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY, MAIL_TEST_URL: mailUrl },
    stdio: "inherit"
  });
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
