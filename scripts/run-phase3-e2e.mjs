import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

import { registerVerificationNextProcess, stopVerificationNextProcess } from "./verification-processes.mjs";

const status = JSON.parse(execFileSync(process.execPath, [resolve("node_modules/supabase/dist/supabase.js"), "status", "-o", "json"], { encoding: "utf8" }));
for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) if (!status[key]) throw new Error(`Local Supabase missing ${key}`);
const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  APP_BASE_URL: "http://127.0.0.1:3000",
  LEGACY_GAME_URL: "http://127.0.0.1:4173/docs/index.html",
  BILLING_ENABLED: "true",
  BILLING_ENVIRONMENT: "test",
  BILLING_PROVIDER: "fixture",
  STRIPE_MODE: "test",
  STRIPE_API_VERSION: "2026-02-25.clover",
  STRIPE_PUBLISHABLE_KEY: "pk_test_fixture12345",
  STRIPE_SECRET_KEY: "sk_test_fixture12345",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture12345",
  STRIPE_PRODUCT_TEACHER_PRO: "prod_fixture123",
  STRIPE_PRICE_TEACHER_PRO_MONTHLY: "price_monthly123",
  STRIPE_PRICE_TEACHER_PRO_ANNUAL: "price_annual123",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture123",
  BILLING_APP_BASE_URL: "http://127.0.0.1:3000",
  BILLING_CHECKOUT_ENABLED: "true",
  BILLING_PORTAL_ENABLED: "true",
  BILLING_WEBHOOK_ENABLED: "true",
  BILLING_EMERGENCY_DEFAULT_DENY: "false"
};
const staticServer = spawn(process.execPath, [resolve("scripts/serve-static.mjs"), "--port", "4173"], { stdio: ["ignore", "ignore", "inherit"] });
const app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", resolve("apps/platform-web"), "--hostname", "127.0.0.1", "--port", "3000"], { env: environment, stdio: ["ignore", "inherit", "inherit"] });
registerVerificationNextProcess(app);
async function waitFor(url) { const end = Date.now() + 45_000; while (Date.now() < end) { try { if ((await fetch(url)).ok) return; } catch { /* starting */ } await new Promise((done) => setTimeout(done, 200)); } throw new Error("Phase 3 server unavailable"); }
async function stop(child, isNext = false) { if (isNext) return stopVerificationNextProcess(child); child.kill(); if (child.exitCode === null) await Promise.race([once(child, "exit"), new Promise((done) => setTimeout(done, 2_000))]); }
let code = 1;
try {
  await Promise.all([waitFor("http://127.0.0.1:3000/pricing"), waitFor("http://127.0.0.1:4173/docs/index.html")]);
  const test = spawn(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.phase3.config.mjs"], { env: { ...environment, SUPABASE_TEST_URL: status.API_URL, SUPABASE_TEST_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY, SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY }, stdio: "inherit" });
  [code] = await once(test, "exit");
} finally {
  await Promise.all([stop(app, true), stop(staticServer)]);
}
process.exitCode = code ?? 1;
