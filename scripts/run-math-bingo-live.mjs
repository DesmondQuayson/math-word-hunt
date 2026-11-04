/**
 * Math Bingo Live — LOCAL owner review and certification runner.
 *
 * Boots the platform (production-platform rehearsal) against LOCAL Supabase
 * with the local owner preview of the DRAFT game switched on, and makes sure
 * a synthetic FREE teacher account exists (no subscription, no trial) so the
 * "free teacher can host" path is what gets exercised.
 *
 *   node scripts/run-math-bingo-live.mjs demo                 keep the app running for the owner demo
 *   node scripts/run-math-bingo-live.mjs e2e [playwright args] run e2e/math-bingo-live, then stop
 *   node scripts/run-math-bingo-live.mjs load                 run scripts/math-bingo-live-load.mjs against it
 *   node scripts/run-math-bingo-live.mjs thumbnail            capture the catalog artwork from a real game
 *   add --production to serve `next start` from a fresh `next build` instead of `next dev`
 *
 * Local-only by construction: refuses any non-loopback Supabase, and the
 * preview flag is honoured by the app only on a loopback origin.
 */
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  cleanPlatformGeneratedNextState,
  registerVerificationNextProcess,
  stopVerificationNextProcess,
  waitForLocalSupabaseAuth
} from "./verification-processes.mjs";

// Every path below is relative to this repository, wherever the runner is started from.
process.chdir(fileURLToPath(new URL("..", import.meta.url)));

export const DEMO_TEACHER = Object.freeze({ email: "bingo-teacher@example.test", password: "BingoTeacher42!" });

const [mode = "demo", ...rest] = process.argv.slice(2);
const production = rest.includes("--production");
const passThrough = rest.filter(argument => argument !== "--production");
if (!["demo", "e2e", "load", "thumbnail"].includes(mode)) throw new Error(`Unknown mode ${mode}`);

const cli = resolve("node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
  if (typeof status[key] !== "string" || status[key].length < 10) throw new Error(`Local Supabase status is missing ${key}.`);
}
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(status.API_URL)) throw new Error("Math Bingo Live review is local-only.");

const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
await waitForLocalSupabaseAuth(admin);
const catalog = await admin.from("game_catalog_entries").select("status").eq("stable_key", "math-bingo-live").maybeSingle();
if (catalog.error || catalog.data?.status !== "draft") {
  throw new Error("Apply supabase/migrations/20261103100000_math_bingo_live.sql to local Supabase first (the entry must be DRAFT).");
}
const identity = await admin.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
if (identity.error) throw identity.error;

// The synthetic FREE teacher: confirmed email, no entitlement, no trial.
async function ensureDemoTeacher() {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const existing = listed.data.users.find(user => user.email === DEMO_TEACHER.email);
  if (existing) {
    const updated = await admin.auth.admin.updateUserById(existing.id, { password: DEMO_TEACHER.password, email_confirm: true });
    if (updated.error) throw updated.error;
    return existing.id;
  }
  const created = await admin.auth.admin.createUser({ email: DEMO_TEACHER.email, password: DEMO_TEACHER.password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Demo teacher unavailable.");
  return created.data.user.id;
}
const teacherId = await ensureDemoTeacher();
const entitlements = await admin.from("consumer_game_entitlements").select("user_id").eq("user_id", teacherId);
if (entitlements.error) throw entitlements.error;
if ((entitlements.data ?? []).length !== 0) throw new Error("The demo teacher must stay a FREE account (no entitlement row).");

// The preview launcher passes PORT when it has to move off the configured port.
const port = Number(process.env.PORT ?? process.env.MATH_BINGO_LIVE_APP_PORT ?? 3100);
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
  MVH_BUILD_ID: "math-bingo-live-local",
  MVH_ADMIN_ENABLED: "true",
  MVH_ADMIN_SESSION_MINUTES: "15",
  MVH_ADMIN_CSRF_SECRET: "math-bingo-live-local-admin-csrf-secret",
  MVH_GAME_DELIVERY_SECRET: "math-bingo-live-local-delivery-secret-value",
  MVH_PILOT_STATE: "inactive",
  MVH_INVITATIONS_ENABLED: "false",
  MVH_EMAIL_DELIVERY: "local-capture",
  MVH_MONITORING_MODE: "console",
  MVH_DELETION_MODE: "dry-run",
  MVH_SUPPORT_EMAIL: "support@example.invalid",
  MVH_MATH_BINGO_LIVE_PREVIEW: "local-owner-review",
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
const next = resolve("node_modules/next/dist/bin/next");
if (production) {
  execFileSync(process.execPath, [next, "build", resolve("apps/platform-web")], { env: { ...environment, NODE_ENV: "production" }, stdio: "inherit" });
}
const app = spawn(process.execPath, [next, production ? "start" : "dev", resolve("apps/platform-web"), "--hostname", "127.0.0.1", "--port", String(port)], {
  env: production ? { ...environment, NODE_ENV: "production" } : environment,
  stdio: ["ignore", "inherit", "inherit"]
});
registerVerificationNextProcess(app);

async function waitForApp() {
  const deadline = Date.now() + 120_000;
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
    await new Promise(done => setTimeout(done, 250));
  }
  throw new Error(`Application did not become ready (last status: ${lastStatus}).`);
}

const restore = async () => {
  await stopVerificationNextProcess(app);
  const restored = await admin.rpc("set_platform_identity_model", { p_identity_model: "legacy-preview" });
  if (restored.error) console.error("Failed to restore the local Preview identity model.", restored.error.message);
  return !restored.error;
};

let exitCode = 1;
try {
  await waitForApp();
  const shared = { ...environment, MATH_BINGO_LIVE_URL: origin, SUPABASE_TEST_URL: status.API_URL, SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY, BINGO_TEACHER_EMAIL: DEMO_TEACHER.email, BINGO_TEACHER_PASSWORD: DEMO_TEACHER.password };
  if (mode === "demo") {
    console.log(`\nMath Bingo Live owner review is running.\n  Host: ${origin}/games/math-bingo-live/host\n  Join: ${origin}/join\n  Teacher sign-in: ${DEMO_TEACHER.email} (password in owner-review/math-bingo-live-owner-review-2026-11-03.md)\nPress Ctrl+C to stop.\n`);
    await new Promise(done => {
      process.once("SIGINT", done);
      process.once("SIGTERM", done);
      app.once("exit", done);
    });
    exitCode = 0;
  } else {
    const command = mode === "e2e"
      ? [resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.math-bingo-live.config.mjs", ...passThrough]
      : [resolve(mode === "load" ? "scripts/math-bingo-live-load.mjs" : "scripts/capture-math-bingo-live-thumbnail.mjs"), ...passThrough];
    const child = spawn(process.execPath, command, { env: shared, stdio: "inherit" });
    [exitCode] = await once(child, "exit");
  }
} finally {
  const restored = await restore();
  if (!restored) exitCode = 1;
}
process.exitCode = exitCode ?? 1;
