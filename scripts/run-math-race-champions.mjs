/**
 * Math Race Champions — LOCAL owner review and test runner.
 *
 * Boots the platform against LOCAL Supabase with the local owner preview of the
 * DRAFT game switched on, and makes sure the synthetic accounts exist (free
 * accounts: no subscription, no trial), so the free-game path is exercised.
 *
 *   node scripts/run-math-race-champions.mjs demo                  keep the app running for the owner review
 *   node scripts/run-math-race-champions.mjs e2e [playwright args] run e2e/math-race-champions, then stop
 *   node scripts/run-math-race-champions.mjs load [args]           run scripts/math-race-champions-load.mjs against it
 *   node scripts/run-math-race-champions.mjs thumbnail             capture the catalog artwork from a real race
 *   node scripts/run-math-race-champions.mjs regress-bingo [args]  run the Math Bingo Live suite against this build
 *   node scripts/run-math-race-champions.mjs regress-polygon [args] run the Polygon Showdown suite against this build
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
  owner: { email: "race-owner@example.test", password: "RaceOwner42!" },
  racer: { email: "race-racer@example.test", password: "RaceRacer42!" },
  creator: { email: "race-creator@example.test", password: "RaceCreator42!" },
  shopper: { email: "race-shopper@example.test", password: "RaceShopper42!" },
  // The other live games' accounts, so their suites can run against this build.
  teacher: { email: "bingo-teacher@example.test", password: "BingoTeacher42!" },
  polygonOwner: { email: "polygon-owner@example.test", password: "PolygonOwner42!" },
  polygonCreator: { email: "polygon-creator@example.test", password: "PolygonCreator42!" },
  polygonJoiner: { email: "polygon-joiner@example.test", password: "PolygonJoiner42!" },
  polygonShopper: { email: "polygon-shopper@example.test", password: "PolygonShopper42!" }
});

// The local stand-in for a school's access code: proves such a session stays a guest.
const SCHOOL_CODE = "RACE-LOCAL";

const MODES = ["demo", "e2e", "load", "thumbnail", "regress-bingo", "regress-polygon"];
const [mode = "demo", ...passThrough] = process.argv.slice(2);
if (!MODES.includes(mode)) throw new Error(`Unknown mode ${mode}`);

const cli = resolve("node_modules/supabase/dist/supabase.js");
const status = JSON.parse(execFileSync(process.execPath, [cli, "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) {
  if (typeof status[key] !== "string" || status[key].length < 10) throw new Error(`Local Supabase status is missing ${key}.`);
}
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(status.API_URL)) throw new Error("Math Race Champions review is local-only.");

const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
await waitForLocalSupabaseAuth(admin);
const catalog = await admin.from("game_catalog_entries").select("status").eq("stable_key", "math-race-champions").maybeSingle();
if (catalog.error || catalog.data?.status !== "draft") {
  throw new Error("Apply the math_race_champions migrations to local Supabase first (the entry must be DRAFT).");
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

const port = Number(process.env.PORT ?? process.env.MATH_RACE_CHAMPIONS_APP_PORT ?? 3103);
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
  MVH_BUILD_ID: "math-race-champions-local",
  MVH_ADMIN_ENABLED: "true",
  MVH_ADMIN_SESSION_MINUTES: "15",
  MVH_ADMIN_CSRF_SECRET: "math-race-champions-local-admin-csrf-secret",
  MVH_GAME_DELIVERY_SECRET: "math-race-champions-local-delivery-secret-value",
  MVH_PILOT_STATE: "inactive",
  MVH_INVITATIONS_ENABLED: "false",
  MVH_EMAIL_DELIVERY: "local-capture",
  MVH_MONITORING_MODE: "console",
  MVH_DELETION_MODE: "dry-run",
  MVH_SUPPORT_EMAIL: "support@example.invalid",
  MVH_MATH_RACE_CHAMPIONS_PREVIEW: "local-owner-review",
  MVH_POLYGON_SHOWDOWN_PREVIEW: "local-owner-review",
  MVH_MATH_BINGO_LIVE_PREVIEW: "local-owner-review",
  MATHNEXA_SCHOOL_ACCESS_CODE: SCHOOL_CODE,
  MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET: "math-race-champions-local-school-access-secret-value",
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
    MATH_RACE_CHAMPIONS_URL: origin,
    POLYGON_SHOWDOWN_URL: origin,
    MATH_BINGO_LIVE_URL: origin,
    SUPABASE_TEST_URL: status.API_URL,
    SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY,
    BINGO_TEACHER_EMAIL: ACCOUNTS.teacher.email,
    BINGO_TEACHER_PASSWORD: ACCOUNTS.teacher.password,
    RACE_ACCOUNTS: JSON.stringify({ owner: ACCOUNTS.owner, racer: ACCOUNTS.racer, creator: ACCOUNTS.creator, shopper: ACCOUNTS.shopper }),
    RACE_SCHOOL_CODE: SCHOOL_CODE,
    POLYGON_ACCOUNTS: JSON.stringify({
      owner: ACCOUNTS.polygonOwner,
      creator: ACCOUNTS.polygonCreator,
      joiner: ACCOUNTS.polygonJoiner,
      shopper: ACCOUNTS.polygonShopper,
      teacher: ACCOUNTS.teacher
    }),
    // The Polygon suite signs in with its own school code name.
    POLYGON_SCHOOL_CODE: SCHOOL_CODE
  };
  if (mode === "demo") {
    console.log(`\nMath Race Champions owner review is running.\n  Game: ${origin}/games/math-race-champions/play\n  Join: ${origin}/join\nPress Ctrl+C to stop.\n`);
    await new Promise((done) => {
      process.once("SIGINT", done);
      process.once("SIGTERM", done);
      app.once("exit", done);
    });
    exitCode = 0;
  } else {
    const playwright = resolve("node_modules/@playwright/test/cli.js");
    const command = {
      e2e: [playwright, "test", "--config=playwright.math-race-champions.config.mjs", ...passThrough],
      "regress-bingo": [playwright, "test", "--config=playwright.math-bingo-live.config.mjs", ...passThrough],
      "regress-polygon": [playwright, "test", "--config=playwright.polygon-showdown.config.mjs", ...passThrough],
      load: [resolve("scripts/math-race-champions-load.mjs"), ...passThrough],
      thumbnail: [resolve("scripts/capture-math-race-champions-thumbnail.mjs"), ...passThrough]
    }[mode];
    const child = spawn(process.execPath, command, { env: shared, stdio: "inherit" });
    [exitCode] = await once(child, "exit");
  }
} finally {
  const restored = await restore();
  if (!restored) exitCode = 1;
}
process.exitCode = exitCode ?? 1;
