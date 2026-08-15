import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const origin = "https://mathnexa-platform-staging.vercel.app";
const projectRef = "gcmuhzxkwvfireyrearl";
const projectName = "mathnexa-platform-staging";
const projectId = "prj_O61Cyx9WMjc0jljpM9erCiSXsJA0";
const scope = "bright-path-ed-tech";
const branch = "feature/all-access-product-model";
const repositoryRoot = resolve(process.cwd());
const supabaseCli = resolve("node_modules/supabase/dist/supabase.js");
const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-phase9b-staging-"));
const supabaseWork = join(workRoot, "supabase-work");

function required(name, pattern = /\S/) {
  const value = process.env[name]?.trim() ?? "";
  if (!pattern.test(value)) throw new Error(`missing-${name.toLowerCase().replaceAll("_", "-")}`);
  return value;
}

const accessToken = required("SUPABASE_ACCESS_TOKEN", /^sbp_/);
const databasePassword = required("SUPABASE_DB_PASSWORD", /^.{32,}$/);
const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
const secretKey = required("SUPABASE_SECRET_KEY");
const stagingToken = required("MVH_STAGING_ACCESS_TOKEN", /^[A-Za-z0-9_-]{43}$/);
const bypassSecret = required("VERCEL_AUTOMATION_BYPASS_SECRET", /^[A-Za-z0-9_-]{20,}$/);
const vercelCli = required("PHASE9B_VERCEL_CLI");
const candidateTree = required("PHASE9B_CANDIDATE_TREE", /^[a-f0-9]{40}$/);
const supabaseUrl = `https://${projectRef}.supabase.co`;
const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const secrets = [accessToken, databasePassword, publishableKey, secretKey, stagingToken, bypassSecret];

function check(value, code) {
  if (!value) throw new Error(code);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: [options.input ? "pipe" : "ignore", "pipe", "pipe"],
    input: options.input
  });
  if (result.status !== 0) {
    let safe = `${result.stdout}\n${result.stderr}`;
    for (const secret of secrets) safe = safe.replaceAll(secret, "[REDACTED]");
    throw new Error(`command-failed:${safe.slice(-4000)}`);
  }
  return result.stdout.trim();
}

function supabase(args) {
  return run(process.execPath, [supabaseCli, ...args, "--workdir", supabaseWork, "--yes"], {
    env: {
      ...process.env,
      SUPABASE_ACCESS_TOKEN: accessToken,
      SUPABASE_DB_PASSWORD: databasePassword,
      SUPABASE_TELEMETRY_DISABLED: "true"
    }
  });
}

function vercel(args, input) {
  const executable = process.env.ComSpec ?? "cmd.exe";
  return run(executable, ["/d", "/s", "/c", vercelCli, ...args], { input });
}

function inspectDeployment(url) {
  const deployment = parseJsonOutput(vercel(["inspect", url, "--scope", scope, "--json"]));
  check(/^dpl_/.test(deployment.id ?? "") && deployment.readyState === "READY", "staging-deployment-inspection-invalid");
  return deployment;
}

function findReadyCandidateDeployment() {
  const listing = parseJsonOutput(vercel(["list", projectName, "--scope", scope, "--json"]));
  const deployments = Array.isArray(listing) ? listing : listing.deployments ?? [];
  const match = deployments.find((item) => item.state === "READY" && item.target === "production" && item.meta?.candidateTree === candidateTree);
  return match?.url ? inspectDeployment(match.url) : null;
}

function parseJsonOutput(value) {
  const objectStart = value.indexOf("{");
  const arrayStart = value.indexOf("[");
  const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  const closing = value[start] === "[" ? "]" : "}";
  const end = value.lastIndexOf(closing);
  check(start >= 0 && end > start, "provider-json-missing");
  return JSON.parse(value.slice(start, end + 1));
}

async function managementQuery(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ query, password: databasePassword })
  });
  const text = await response.text();
  if (!response.ok) {
    let safe = text;
    for (const secret of secrets) safe = safe.replaceAll(secret, "[REDACTED]");
    throw new Error(`management-query-failed-${response.status}:${safe.slice(-1000)}`);
  }
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

function rows(value) {
  return Array.isArray(value) ? value : value?.result ?? value?.data ?? [];
}

async function commercialFingerprint() {
  const result = await managementQuery(`select md5(jsonb_build_object(
    'billing_customers',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.billing_customers t),
    'billing_subscriptions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.billing_subscriptions t),
    'billing_webhook_events',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.billing_webhook_events t),
    'acceptances',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.consumer_commercial_acceptances t),
    'bindings',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.consumer_checkout_acceptance_bindings t),
    'entitlements',(select coalesce(jsonb_agg(to_jsonb(t)-'capability_key' order by user_id),'[]'::jsonb) from public.consumer_game_entitlements t),
    'admin_users',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.admin_users t),
    'content_resources',(select coalesce(jsonb_agg(to_jsonb(t)-'resource_scope'-'scope_status' order by id),'[]'::jsonb) from public.content_resources t)
  )::text) as fingerprint;`);
  const fingerprint = rows(result)[0]?.fingerprint;
  check(/^[a-f0-9]{32}$/.test(fingerprint ?? ""), "commercial-fingerprint-unavailable");
  return fingerprint;
}

async function authCount() {
  const result = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (result.error) throw new Error("auth-inventory-failed");
  return result.data.users.length;
}

async function waitFor(label, read, accept, timeout = 180_000) {
  const deadline = Date.now() + timeout;
  let latest;
  while (Date.now() < deadline) {
    latest = await read();
    if (await accept(latest)) return latest;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
  throw new Error(`${label}-timed-out`);
}

async function waitForConsumer(userId) {
  await waitFor("consumer-account", () => admin.from("consumer_accounts").select("user_id").eq("user_id", userId).maybeSingle(), (value) => !value.error && Boolean(value.data));
}

async function signIn(page, email, password, destination) {
  await page.goto(`${origin}/sign-in?next=${destination}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${origin}${destination}`);
}

async function verifyCrossAccountDenied(email, password, otherUserId) {
  const browser = createClient(supabaseUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const signedIn = await browser.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error("cross-account-sign-in-failed");
  const result = await browser.from("consumer_game_entitlements").select("user_id").eq("user_id", otherUserId);
  await browser.auth.signOut();
  check(!result.error && result.data.length === 0, "cross-account-entitlement-exposed");
}

async function main() {
  const runId = randomUUID().replaceAll("-", "");
  const password = `Mx9b-Staging!${runId.slice(0, 12)}`;
  const entitledEmail = `phase9b-${runId}-entitled@example.test`;
  const reviewEmail = `phase9b-${runId}-review@example.test`;
  const userIds = [];
  let primaryError = null;
  let cleanupError = null;
  let deploymentId = null;
  const evidence = {};
  const beforeFingerprint = await commercialFingerprint();
  const beforeAuth = await authCount();
  try {
    cpSync(resolve("supabase"), join(supabaseWork, "supabase"), { recursive: true });
    supabase(["link", "--project-ref", projectRef]);
    supabase(["db", "push", "--linked", "--include-all"]);
    const migration = rows(await managementQuery(`select
      exists(select 1 from supabase_migrations.schema_migrations where version='20260805120000') as migration_applied,
      exists(select 1 from public.game_catalog_entries where stable_key='math-vocabulary-hunt' and launch_type='canonical' and canonical_route='/play' and status='published') as canonical_ready;`))[0];
    check(migration?.migration_applied === true && migration?.canonical_ready === true, "phase9b-staging-schema-not-ready");
    check(await commercialFingerprint() === beforeFingerprint, "staging-migration-commercial-fingerprint-changed");
    evidence.migration = true;

    vercel([
      "api", `/v10/projects/${projectId}/env?upsert=true`, "--scope", scope,
      "--method", "POST", "--input", "-", "--silent"
    ], JSON.stringify({ key: "MVH_BUILD_ID", value: candidateTree, type: "sensitive", target: ["production"] }));
    const project = parseJsonOutput(vercel(["api", `/v9/projects/${projectId}`, "--scope", scope, "--raw"]));
    check(project.id === projectId && project.name === projectName, "staging-project-mismatch");
    let deployment = findReadyCandidateDeployment();
    if (!deployment) {
      vercel([
        "deploy", ".", "--project", projectName, "--scope", scope, "--prod", "--yes", "--json",
        "--meta", `candidateTree=${candidateTree}`, "--meta", `gitCommitRef=${branch}`
      ]);
      deployment = findReadyCandidateDeployment();
    }
    check(Boolean(deployment), "staging-deployment-not-found");
    deploymentId = deployment.id;
    await waitFor(
      "staging-deployment",
      () => fetch(origin, { redirect: "manual", headers: { "x-vercel-protection-bypass": bypassSecret } }),
      (response) => response.status === 404 && response.headers.get("cache-control")?.includes("no-store"),
      300_000
    );
    evidence.deployment = true;

    const entitled = await admin.auth.admin.createUser({ email: entitledEmail, password, email_confirm: true, user_metadata: { synthetic_run_id: runId } });
    const review = await admin.auth.admin.createUser({ email: reviewEmail, password, email_confirm: true, user_metadata: { synthetic_run_id: runId } });
    if (entitled.error || !entitled.data.user || review.error || !review.data.user) throw new Error("synthetic-user-create-failed");
    userIds.push(entitled.data.user.id, review.data.user.id);
    await waitForConsumer(entitled.data.user.id);
    await waitForConsumer(review.data.user.id);
    const endsAt = new Date(Date.now() + 86_400_000).toISOString();
    const entitlement = await admin.from("consumer_game_entitlements").insert({
      user_id: entitled.data.user.id,
      capability_key: "MATHNEXA_ALL_ACCESS",
      entitlement_state: "subscription-active",
      current_period_ends_at: endsAt
    });
    if (entitlement.error) throw new Error("synthetic-entitlement-create-failed");
    await verifyCrossAccountDenied(reviewEmail, password, entitled.data.user.id);
    evidence.crossAccountDenied = true;

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 320, height: 760 },
      reducedMotion: "reduce",
      forcedColors: "active",
      extraHTTPHeaders: { "x-vercel-protection-bypass": bypassSecret }
    });
    const bootstrap = await context.request.post(`${origin}/api/internal/staging-access/bootstrap`, {
      headers: { Authorization: `Bearer ${stagingToken}`, "x-vercel-protection-bypass": bypassSecret }
    });
    check(bootstrap.status() === 204, "staging-access-bootstrap-failed");
    const page = await context.newPage();
    try {
      const publicResponse = await context.request.get(`${origin}/`);
      const publicHtml = await publicResponse.text();
      check(publicResponse.status() === 200 && publicHtml.includes("Make every math lesson clearer"), "public-homepage-smoke-failed");
      check(secrets.every((secret) => !publicHtml.includes(secret)), "hosted-secret-exposure");
      check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth).catch(() => true), "mobile-overflow");

      for (const destination of ["/games", "/homework", "/quizzes", "/map-prep"]) {
        await context.clearCookies();
        const access = await context.request.post(`${origin}/api/internal/staging-access/bootstrap`, {
          headers: { Authorization: `Bearer ${stagingToken}`, "x-vercel-protection-bypass": bypassSecret }
        });
        check(access.status() === 204, "staging-access-refresh-failed");
        await signIn(page, entitledEmail, password, destination);
        check(page.url() === `${origin}${destination}`, `post-subscription-return-failed:${destination}`);
      }
      await page.goto(`${origin}/games`);
      check(await page.getByRole("heading", { name: "Math Vocabulary Hunt" }).isVisible(), "canonical-card-missing");
      check(await page.getByRole("combobox", { name: "Grade" }).count() === 0, "games-grade-selector-present");
      check(!(await page.locator("body").innerText()).includes("game doesn’t exist"), "missing-game-copy-present");
      await page.getByRole("link", { name: "Play" }).click();
      await page.waitForURL(`${origin}/play`);
      check(await page.getByRole("heading", { name: "Game access verified" }).isVisible(), "canonical-launch-failed");
      evidence.games = true;

      await page.goto(`${origin}/homework`);
      check(await page.getByRole("combobox", { name: "Grade" }).isVisible(), "homework-grade-missing");
      check(await page.getByRole("combobox", { name: "Topic" }).isVisible(), "homework-topic-missing");
      check(await page.getByRole("combobox", { name: "Lesson" }).isVisible(), "homework-lesson-missing");
      check((await page.locator("body").innerText()).includes("Your subscription is active"), "homework-empty-state-not-entitled");
      evidence.homework = true;

      await page.goto(`${origin}/quizzes`);
      check(await page.getByRole("combobox", { name: "Grade" }).isVisible(), "quiz-grade-missing");
      check(await page.getByRole("combobox", { name: "Topic" }).isVisible(), "quiz-topic-missing");
      check(await page.getByRole("combobox", { name: "Lesson" }).count() === 0, "quiz-lesson-present");
      check((await page.locator("body").innerText()).includes("Your subscription is active"), "quiz-empty-state-not-entitled");
      evidence.quizzes = true;

      await page.goto(`${origin}/map-prep`);
      const mapBody = await page.locator("body").innerText();
      check(mapBody.includes("MAP Prep is not configured") || await page.getByRole("link", { name: "Open MAP Prep" }).count() === 1, "map-prep-state-invalid");
      evidence.mapPrep = true;

      await context.clearCookies();
      const access = await context.request.post(`${origin}/api/internal/staging-access/bootstrap`, {
        headers: { Authorization: `Bearer ${stagingToken}`, "x-vercel-protection-bypass": bypassSecret }
      });
      check(access.status() === 204, "staging-access-review-failed");
      await signIn(page, reviewEmail, password, "/games");
      await page.waitForURL(`${origin}/subscription?next=/games`);
      check((await page.locator("body").innerText()).includes("One MathNexa subscription includes Games, MAP Prep, Homework, and Quizzes."), "payment-required-copy-missing");
      evidence.paymentAndContentStatesDistinct = true;

      await context.clearCookies();
      const adminAccess = await context.request.post(`${origin}/api/internal/staging-access/bootstrap`, {
        headers: { Authorization: `Bearer ${stagingToken}`, "x-vercel-protection-bypass": bypassSecret }
      });
      check(adminAccess.status() === 204, "staging-admin-access-failed");
      const adminSignIn = await context.request.get(`${origin}/admin/sign-in`, { maxRedirects: 0 });
      const adminHidden = await context.request.get(`${origin}/admin`, { maxRedirects: 0 });
      check(adminSignIn.status() === 200 && adminHidden.status() === 404, "admin-regression-smoke-failed");
      evidence.admin = true;
      check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "mobile-overflow");
    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  } catch (error) {
    primaryError = error;
  } finally {
    for (const userId of userIds) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error && !/not found/i.test(deleted.error.message)) cleanupError ??= new Error("synthetic-user-cleanup-failed");
    }
    try {
      for (const userId of userIds) {
        for (const [table, column] of [["consumer_accounts", "user_id"], ["consumer_game_entitlements", "user_id"], ["billing_customers", "owner_consumer_id"], ["billing_subscriptions", "owner_consumer_id"], ["consumer_commercial_acceptances", "owner_user_id"], ["consumer_checkout_acceptance_bindings", "owner_user_id"]]) {
          const count = await admin.from(table).select(column, { count: "exact", head: true }).eq(column, userId);
          check(!count.error && count.count === 0, `cleanup-${table}-not-zero`);
        }
      }
      check(await authCount() === beforeAuth, "cleanup-auth-count-changed");
      check(await commercialFingerprint() === beforeFingerprint, "cleanup-commercial-fingerprint-changed");
      evidence.cleanupToZero = true;
    } catch (error) {
      cleanupError ??= error;
    }
    rmSync(workRoot, { recursive: true, force: true });
  }
  if (cleanupError) throw new Error(`cleanup-to-zero-failed:${cleanupError.message}`);
  if (primaryError) throw primaryError;
  process.stdout.write(`${JSON.stringify({ passed: true, candidateTree, deploymentId, fingerprint: createHash("sha256").update(beforeFingerprint).digest("hex").slice(0, 16), evidence }, null, 2)}\n`);
}

await main();
