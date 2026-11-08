/**
 * Polygon Showdown — LOCAL owner review and test runner.
 *
 * Boots the platform against LOCAL Supabase with the local owner preview of the
 * DRAFT game switched on, and makes sure the synthetic accounts exist (free
 * accounts: no subscription, no trial), so the free-game path is exercised.
 *
 *   node scripts/run-polygon-showdown.mjs demo                  keep the app running for the owner review
 *   node scripts/run-polygon-showdown.mjs e2e [playwright args] run e2e/polygon-showdown, then stop
 *   node scripts/run-polygon-showdown.mjs load                  run scripts/polygon-showdown-load.mjs against it
 *   node scripts/run-polygon-showdown.mjs thumbnail             capture the catalog artwork from a real game
 *   node scripts/run-polygon-showdown.mjs regress [args]        run the Math Bingo Live suite against this build
 *
 * Local-only by construction: refuses any non-loopback Supabase, and the preview
 * flag is honoured by the app only on a loopback origin. It always serves
 * `next dev`: the production-platform rehearsal refuses a loopback Supabase
 * under NODE_ENV=production by design.
 */
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { cleanPlatformGeneratedNextState, registerVerificationNextProcess, stopVerificationNextProcess, waitForLocalSupabaseAuth } from "./verification-processes.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));

// Synthetic local accounts for review and tests. Not real people, not real
// passwords, never present outside local Supabase.
export const ACCOUNTS = Object.freeze({
  owner: { email: "polygon-owner@example.test", password: "PolygonOwner42!" },
  creator: { email: "polygon-creator@example.test", password: "PolygonCreator42!" },
  joiner: { email: "polygon-joiner@example.test", password: "PolygonJoiner42!" },
  shopper: { email: "polygon-shopper@example.test", password: "PolygonShopper42!" },
  teacher: { email: "bingo-teacher@example.test", password: "BingoTeacher42!" }
});

// The local stand-in for a school's access code: proves such a session stays a guest.
const SCHOOL_CODE = "POLYGON-LOCAL";

const [mode = "demo", ...passThrough] = process.argv.slice(2);
if (!["demo", "e2e", "load", "thumbnail", "regress"].includes(mode)) throw new Error(`Unknown mode ${mode}`);

const cli = resolve("node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
  if (typeof status[key] !== "string" || status[key].length < 10) throw new Error(`Local Supabase status is missing ${key}.`);
}
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(status.API_URL)) throw new Error("Polygon Showdown review is local-only.");

const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
await waitForLocalSupabaseAuth(admin);
const catalog = await admin.from("game_catalog_entries").select("status").eq("stable_key", "polygon-showdown").maybeSingle();
if (catalog.error || catalog.data?.status !== "draft") {
  throw new Error("Apply supabase/migrations/20261109100000_polygon_showdown.sql to local Supabase first (the entry must be DRAFT).");
}
const identity = await admin.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
if (identity.error) throw identity.error;

const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listed.error) throw listed.error;
for (const account of Object.values(ACCOUNTS)) {
  const existing = listed.data.users.find((user) => user.email === account.email);
  if (existing) {
    const updated = await admin.auth.admin.updateUserById(existing.id, { password: account.password, email_confirm: true });
    if (updated.error) throw updated.error;
  } else {
    const created = await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true });
    if (created.error) throw created.error;
  }
}

const port = Number(process.env.PORT ?? process.env.POLYGON_SHOWDOWN_APP_PORT ?? 3102);
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
  MVH_BUILD_ID: "polygon-showdown-local",
  MVH_ADMIN_ENABLED: "true",
  MVH_ADMIN_SESSION_MINUTES: "15",
  MVH_ADMIN_CSRF_SECRET: "polygon-showdown-local-admin-csrf-secret",
  MVH_GAME_DELIVERY_SECRET: "polygon-showdown-local-delivery-secret-value",
  MVH_PILOT_STATE: "inactive",
  MVH_INVITATIONS_ENABLED: "false",
  MVH_EMAIL_DELIVERY: "local-capture",
  MVH_MONITORING_MODE: "console",
  MVH_DELETION_MODE: "dry-run",
  MVH_SUPPORT_EMAIL: "support@example.invalid",
  MVH_POLYGON_SHOWDOWN_PREVIEW: "local-owner-review",
  MVH_MATH_BINGO_LIVE_PREVIEW: "local-owner-review",
  MATHNEXA_SCHOOL_ACCESS_CODE: SCHOOL_CODE,
  MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET: "polygon-showdown-local-school-access-secret-value",
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
const app = spawn(process.execPath, [next, "dev", resolve("apps/platform-web"), "--hostname", "127.0.0.1", "--port", String(port)], { env: environment, stdio: ["ignore", "inherit", "inherit"] });
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
    await new Promise((done) => setTimeout(done, 250));
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
  const shared = {
    ...environment,
    POLYGON_SHOWDOWN_URL: origin,
    MATH_BINGO_LIVE_URL: origin,
    SUPABASE_TEST_URL: status.API_URL,
    SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY,
    BINGO_TEACHER_EMAIL: ACCOUNTS.teacher.email,
    BINGO_TEACHER_PASSWORD: ACCOUNTS.teacher.password,
    POLYGON_ACCOUNTS: JSON.stringify(ACCOUNTS),
    POLYGON_SCHOOL_CODE: SCHOOL_CODE
  };
  if (mode === "demo") {
    console.log(`\nPolygon Showdown owner review is running.\n  App:  ${origin}/games/polygon-showdown/play\n  Join: ${origin}/join\nPress Ctrl+C to stop.\n`);
    await new Promise((done) => {
      process.once("SIGINT", done);
      process.once("SIGTERM", done);
      app.once("exit", done);
    });
    exitCode = 0;
  } else {
    const command = mode === "e2e"
      ? [resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.polygon-showdown.config.mjs", ...passThrough]
      : mode === "regress"
        ? [resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.math-bingo-live.config.mjs", ...passThrough]
        : [resolve({ load: "scripts/polygon-showdown-load.mjs", thumbnail: "scripts/capture-polygon-showdown-thumbnail.mjs" }[mode]), ...passThrough];
    const child = spawn(process.execPath, command, { env: shared, stdio: "inherit" });
    [exitCode] = await once(child, "exit");
  }
} finally {
  const restored = await restore();
  if (!restored) exitCode = 1;
}
process.exitCode = exitCode ?? 1;
