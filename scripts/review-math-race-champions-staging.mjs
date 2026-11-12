/**
 * Math Race Champions — the real-browser suite against a STAGING preview.
 *
 * Launched by scripts/invoke-math-race-champions-staging.ps1 -Stage review
 * -Origin <preview URL>, which supplies the staging secret key and the Vercel
 * protection-bypass entry. The bypass value is spent once to get Vercel's
 * host-only cookie and is not passed on to the test run; the browsers ride on
 * that cookie.
 *
 * Creates four synthetic accounts (@example.invalid) for the run, drives
 * e2e/math-race-champions against the preview, then deletes the accounts and
 * every race room created since the run began. Production is never contacted.
 *
 *   REVIEW_PROJECTS  comma list of Playwright projects (default "chromium")
 *   REVIEW_ARGS      extra Playwright arguments, e.g. spec file names
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { createProtectionBypass } from "./vercel-protection-bypass.mjs";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const origin = (process.env.STAGING_ORIGIN ?? "").trim().replace(/\/$/, "");
if (!/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(origin)) throw new Error("STAGING_ORIGIN must be a mathnexa-platform-staging preview URL");
for (const name of Object.keys(process.env)) if (/_LIVE_|_PRODUCTION_|_READONLY_/.test(name)) throw new Error(`refusing: ${name} is present in this process`);
const secretKey = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
const bypass = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
if (secretKey.length < 20 || bypass.length < 20) throw new Error("missing staging entries");
const projects = (process.env.REVIEW_PROJECTS ?? "chromium").split(",").map((name) => name.trim()).filter(Boolean);
// The school-session spec needs a local school code; everything else runs.
const DEFAULT_SPECS = ["classroom.spec.ts", "computer.spec.ts", "shop.spec.ts", "online.spec.ts", "wording.spec.ts", "audio.spec.ts", "devices.spec.ts"];
const extra = (process.env.REVIEW_ARGS ?? "").split(" ").filter(Boolean);

const supabaseUrl = `https://${STAGING_PROJECT_REF}.supabase.co`;
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const protection = createProtectionBypass({ origin, secret: bypass });

const run = randomBytes(4).toString("hex");
const roles = ["owner", "racer", "creator", "shopper"];
const accounts = Object.fromEntries(roles.map((role) => [role, { email: `race-staging-${run}-${role}@example.invalid`, password: `${randomBytes(18).toString("base64url")}Aa1!` }]));
const startedAt = new Date().toISOString();
const stateDir = resolve("test-results/math-race-champions-staging");
const statePath = resolve(stateDir, `bypass-${run}.json`);

let exitCode = 1;
try {
  // Which build is under review.
  const health = await fetch(`${origin}/api/health`, { headers: protection.headersFor(`${origin}/api/health`), redirect: "manual" });
  const body = await health.json().catch(() => ({}));
  const commit = body.commit ?? body.build?.commit ?? body.version ?? null;
  console.log(`staging preview health ${health.status}, build ${commit}`);
  const expected = (process.env.EXPECT_COMMIT ?? "").trim();
  if (health.status !== 200) throw new Error(`staging preview health is ${health.status}`);
  if (expected && !String(commit ?? "").startsWith(expected)) throw new Error(`preview build ${commit} is not the expected ${expected}`);

  for (const role of roles) {
    const made = await admin.auth.admin.createUser({ email: accounts[role].email, password: accounts[role].password, email_confirm: true, user_metadata: { synthetic_run_id: run, purpose: "math-race-champions-staging-review" } });
    if (made.error || !made.data.user) throw new Error("synthetic-user-failed");
  }

  mkdirSync(stateDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await protection.install(context);
  await context.storageState({ path: statePath });
  await browser.close();

  const env = {
    ...process.env,
    MATH_RACE_CHAMPIONS_URL: origin,
    POLYGON_SHOWDOWN_URL: origin,
    MATH_BINGO_LIVE_URL: origin,
    RACE_STAGING: "1",
    RACE_STORAGE_STATE: statePath,
    RACE_ACCOUNTS: JSON.stringify(accounts),
    RACE_EVIDENCE_DIR: process.env.REVIEW_OUT || "qa-artifacts/math-race-champions/staging-evidence",
    SUPABASE_TEST_URL: supabaseUrl,
    SUPABASE_TEST_SECRET_KEY: secretKey
  };
  delete env.VERCEL_AUTOMATION_BYPASS_SECRET;
  delete env.SUPABASE_DB_PASSWORD;
  const projectArguments = projects.flatMap((name) => [`--project=${name}`]);
  const specs = extra.some((value) => value.endsWith(".ts")) ? [] : DEFAULT_SPECS;
  const result = spawnSync(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", "--config", "playwright.math-race-champions.config.mjs", ...projectArguments, "--retries=1", ...specs, ...extra], { stdio: "inherit", env });
  exitCode = result.status ?? 1;
} finally {
  // Accounts may have been deleted and re-made by the tests: remove whatever carries this run's addresses.
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const user of listed.data?.users ?? []) {
    if (user.email?.startsWith(`race-staging-${run}-`)) await admin.auth.admin.deleteUser(user.id);
  }
  await admin.from("race_rooms").delete().gte("created_at", startedAt);
  rmSync(statePath, { force: true });
  const left = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const remaining = left.data?.users?.filter((entry) => entry.email?.startsWith(`race-staging-${run}-`)).length ?? -1;
  const rooms = await admin.from("race_rooms").select("id", { count: "exact", head: true }).gte("created_at", startedAt);
  console.log(`cleanup: synthetic accounts left ${remaining}; race rooms left ${rooms.count ?? "unknown"}`);
}
process.exit(exitCode);
