/**
 * Polygon Showdown — the real-browser suite against a STAGING preview.
 *
 * Launched by scripts/invoke-polygon-showdown-staging.ps1 -Stage review
 * -Origin <preview URL>, which supplies the staging secret key and the Vercel
 * protection-bypass entry. The bypass value is spent once to get Vercel's
 * host-only cookie and is not passed on to the test run; the browsers ride on
 * that cookie.
 *
 * Creates four synthetic accounts (@example.invalid) for the run, drives
 * e2e/polygon-showdown against the preview, then deletes the accounts and every
 * room created since the run began. Production is never contacted.
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
const projects = (process.env.REVIEW_PROJECTS ?? "chromium,devices-chromium").split(",").map((name) => name.trim()).filter(Boolean);
const extra = (process.env.REVIEW_ARGS ?? "").split(" ").filter(Boolean);

const supabaseUrl = `https://${STAGING_PROJECT_REF}.supabase.co`;
const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const protection = createProtectionBypass({ origin, secret: bypass });

const run = randomBytes(4).toString("hex");
const roles = ["owner", "creator", "joiner", "shopper"];
const accounts = Object.fromEntries(roles.map((role) => [role, { email: `polygon-staging-${run}-${role}@example.invalid`, password: `${randomBytes(18).toString("base64url")}Aa1!` }]));
const startedAt = new Date().toISOString();
const stateDir = resolve("test-results/polygon-showdown-staging");
const statePath = resolve(stateDir, `bypass-${run}.json`);

let exitCode = 1;
try {
  for (const role of roles) {
    const made = await admin.auth.admin.createUser({ email: accounts[role].email, password: accounts[role].password, email_confirm: true, user_metadata: { synthetic_run_id: run, purpose: "polygon-showdown-staging-review" } });
    if (made.error || !made.data.user) throw new Error("synthetic-user-failed");
  }

  mkdirSync(stateDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await protection.install(context);
  await context.storageState({ path: statePath });
  await browser.close();

  const env = { ...process.env, POLYGON_SHOWDOWN_URL: origin, POLYGON_STAGING: "1", POLYGON_STORAGE_STATE: statePath, POLYGON_ACCOUNTS: JSON.stringify(accounts), SUPABASE_TEST_URL: supabaseUrl, SUPABASE_TEST_SECRET_KEY: secretKey };
  delete env.VERCEL_AUTOMATION_BYPASS_SECRET;
  delete env.SUPABASE_DB_PASSWORD;
  const projectArguments = projects.flatMap((name) => [`--project=${name}`]);
  const result = spawnSync(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", "--config", "playwright.polygon-showdown.config.mjs", ...projectArguments, "--retries=1", ...extra], { stdio: "inherit", env });
  exitCode = result.status ?? 1;
} finally {
  for (const role of roles) {
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const user = listed.data?.users?.find((entry) => entry.email === accounts[role].email);
    if (user) await admin.auth.admin.deleteUser(user.id);
  }
  await admin.from("polygon_rooms").delete().gte("created_at", startedAt);
  rmSync(statePath, { force: true });
  const left = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const remaining = left.data?.users?.filter((entry) => entry.email?.startsWith(`polygon-staging-${run}-`)).length ?? -1;
  console.log(`cleanup: synthetic accounts left ${remaining}`);
}
process.exit(exitCode);
