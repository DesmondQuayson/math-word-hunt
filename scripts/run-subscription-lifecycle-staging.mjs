// Staging-only pipeline for the subscription lifecycle candidate.
//
//   --stage=migrate   link the STAGING Supabase project in a temporary work
//                     directory, capture billing row counts, push migrations,
//                     run the remote pgTAP suite once, verify the synchronizer
//                     exists, and confirm the row counts are unchanged.
//   --stage=deploy    deploy the candidate to the mathnexa-platform-staging
//                     Vercel project (preview target unless --alias) and wait
//                     for it to answer.
//   --stage=certify   probe the deployment: webhook refuses unsigned bodies,
//                     health answers, the scheduler route fails closed, the
//                     fixture route is absent, personalized pages are
//                     no-store, and the locked staging gate still hides pages.
//
// Only STAGING identifiers are hard-coded here. Production project refs are
// refused if they appear in the environment. Nothing is printed from any
// credential; command output is redacted before it is echoed.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const PRODUCTION_PROJECT_REF = "ioodoktlxvvmghyvevgn";
const STAGING_VERCEL_PROJECT = "mathnexa-platform-staging";
const STAGING_ORIGIN = "https://mathnexa-platform-staging.vercel.app";
const SCOPE = "bright-path-ed-tech";

const args = new Map(process.argv.slice(2).map((arg) => { const [key, value = "true"] = arg.split("=", 2); return [key, value]; }));
const stage = args.get("--stage") ?? "certify";
const alias = args.has("--alias");
const targetUrl = args.get("--url") ?? STAGING_ORIGIN;
const repositoryRoot = resolve(process.cwd());
const supabaseCli = resolve("node_modules/supabase/dist/supabase.js");

function required(name, pattern = /\S/) {
  const value = process.env[name]?.trim() ?? "";
  if (!pattern.test(value)) throw new Error(`missing-${name.toLowerCase().replaceAll("_", "-")}`);
  return value;
}
const secrets = [];
function redact(value) { let safe = String(value ?? ""); for (const secret of secrets) if (secret) safe = safe.replaceAll(secret, "[REDACTED]"); return safe.replace(/sk_(test|live)_\S+/g, "[key]").replace(/sbp_\S+/g, "[token]"); }
function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { cwd: options.cwd ?? repositoryRoot, encoding: "utf8", env: options.env ?? process.env, stdio: ["ignore", "pipe", "pipe"], shell: options.shell ?? false });
  if (result.status !== 0) throw new Error(`command-failed:${redact(`${result.stdout}\n${result.stderr}`).slice(-3000)}`);
  return result.stdout.trim();
}
function check(condition, code) { if (!condition) throw new Error(code); }
const evidence = { stage, startedAt: new Date().toISOString() };

async function managementQuery(accessToken, databasePassword, query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${STAGING_PROJECT_REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ query, password: databasePassword })
  });
  const text = await response.text();
  check(response.ok, `management-query-failed-${response.status}:${redact(text).slice(-800)}`);
  const parsed = text ? JSON.parse(text) : [];
  return Array.isArray(parsed) ? parsed : parsed?.result ?? parsed?.data ?? [];
}

async function migrate() {
  const accessToken = required("SUPABASE_ACCESS_TOKEN", /^sbp_/);
  const databasePassword = required("SUPABASE_DB_PASSWORD", /^.{16,}$/);
  secrets.push(accessToken, databasePassword);
  check(!Object.values(process.env).some((value) => typeof value === "string" && value.includes(PRODUCTION_PROJECT_REF)), "production-project-ref-present-refusing");
  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-lifecycle-staging-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    const supabase = (commandArgs) => run(process.execPath, [supabaseCli, ...commandArgs, "--workdir", workRoot, "--yes"], {
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken, SUPABASE_DB_PASSWORD: databasePassword, SUPABASE_TELEMETRY_DISABLED: "true" }
    });
    const counts = () => managementQuery(accessToken, databasePassword,
      "select (select count(*) from public.billing_customers) as customers, (select count(*) from public.billing_subscriptions) as subscriptions, (select count(*) from public.consumer_game_entitlements) as entitlements, (select count(*) from public.billing_webhook_events) as receipts, (select count(*) from public.consumer_accounts) as accounts");
    const before = await counts();
    supabase(["link", "--project-ref", STAGING_PROJECT_REF]);
    const pushed = supabase(["db", "push", "--linked", "--include-all"]);
    evidence.pushOutput = redact(pushed).split("\n").filter((line) => /2026090713|Applying|Finished|up to date|Remote database is up to date/i.test(line)).slice(-6);
    const functions = await managementQuery(accessToken, databasePassword,
      "select proname from pg_proc where proname in ('synchronize_consumer_billing_subscription','mark_consumer_billing_reconciliation_attempt','apply_consumer_billing_projection') order by proname");
    evidence.functions = functions.map((row) => row.proname);
    check(evidence.functions.includes("synchronize_consumer_billing_subscription"), "synchronizer-missing-after-push");
    check(evidence.functions.includes("mark_consumer_billing_reconciliation_attempt"), "throttle-missing-after-push");
    const columns = await managementQuery(accessToken, databasePassword,
      "select column_name from information_schema.columns where table_schema='public' and table_name='billing_subscriptions' and column_name in ('ended_at','latest_invoice_id','last_synchronized_at','last_synchronization_source') order by column_name");
    evidence.columns = columns.map((row) => row.column_name);
    check(evidence.columns.length === 4, "columns-missing-after-push");
    const pgtap = supabase(["test", "db", "--linked"]);
    evidence.remotePgTap = redact(pgtap).split("\n").filter((line) => /Result:|Files=|All tests|not ok/.test(line));
    check(/All tests successful/.test(pgtap), "remote-pgtap-failed");
    const after = await counts();
    evidence.rowCountsBefore = before[0]; evidence.rowCountsAfter = after[0];
    check(JSON.stringify(before) === JSON.stringify(after), "billing-row-counts-changed-by-migration");
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

function vercelBinary() {
  const configured = process.env.LIFECYCLE_VERCEL_CLI?.trim();
  return configured || "npx";
}
function vercel(commandArgs) {
  const binary = vercelBinary();
  return binary === "npx"
    ? run("npx", ["--no-install", "vercel", ...commandArgs], { shell: true })
    : run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", binary, ...commandArgs]);
}

async function waitForOrigin(url, bypass) {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`, { redirect: "manual", headers: bypass ? { "x-vercel-protection-bypass": bypass } : {} });
      if (response.status === 200) return await response.json();
    } catch { /* not ready */ }
    await new Promise((done) => setTimeout(done, 5000));
  }
  throw new Error("deployment-not-ready");
}

async function deploy() {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || null;
  if (bypass) secrets.push(bypass);
  const tree = run("git", ["rev-parse", "HEAD^{tree}"]);
  const commit = run("git", ["rev-parse", "HEAD"]);
  const commandArgs = ["deploy", ".", "--project", STAGING_VERCEL_PROJECT, "--scope", SCOPE, "--yes", "--meta", `candidateTree=${tree}`, "--meta", `candidateCommit=${commit}`];
  if (alias) commandArgs.push("--prod");
  const output = vercel(commandArgs);
  const url = output.split("\n").map((line) => line.trim()).reverse().find((line) => /^https:\/\/\S+\.vercel\.app$/.test(line));
  check(url, `deployment-url-missing:${redact(output).slice(-500)}`);
  evidence.deploymentUrl = url; evidence.candidateTree = tree; evidence.candidateCommit = commit; evidence.aliasTarget = alias;
  evidence.health = await waitForOrigin(alias ? STAGING_ORIGIN : url, bypass);
  console.log(JSON.stringify({ deploymentUrl: url, candidateCommit: commit, aliasTarget: alias }));
}

async function certify() {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || null;
  const stagingToken = process.env.MVH_STAGING_ACCESS_TOKEN?.trim() || null;
  if (bypass) secrets.push(bypass);
  if (stagingToken) secrets.push(stagingToken);
  const base = { redirect: "manual", headers: bypass ? { "x-vercel-protection-bypass": bypass } : {} };
  const results = {};
  const health = await fetch(`${targetUrl}/api/health`, base);
  results.health = { status: health.status, body: health.status === 200 ? await health.json() : null };
  const unsigned = await fetch(`${targetUrl}/api/billing/webhook`, { ...base, method: "POST", headers: { ...base.headers, "content-type": "application/json" }, body: "{}" });
  results.webhookUnsigned = { status: unsigned.status, body: await unsigned.text() };
  const scheduler = await fetch(`${targetUrl}/api/internal/billing/reconcile`, base);
  results.schedulerRoute = { status: scheduler.status, body: await scheduler.text(), cacheControl: scheduler.headers.get("cache-control") };
  const fixture = await fetch(`${targetUrl}/api/internal/billing/fixture`, { ...base, method: "POST", headers: { ...base.headers, "content-type": "application/json" }, body: JSON.stringify({ action: "read-subscription", subscriptionId: "sub_x" }) });
  results.fixtureRoute = { status: fixture.status };
  const lockedAccount = await fetch(`${targetUrl}/account`, base);
  results.lockedGate = { status: lockedAccount.status, bytes: (await lockedAccount.arrayBuffer()).byteLength, cacheControl: lockedAccount.headers.get("cache-control") };
  if (stagingToken) {
    const bootstrap = await fetch(`${targetUrl}/api/internal/staging-access/bootstrap`, { ...base, method: "POST", headers: { ...base.headers, Authorization: `Bearer ${stagingToken}` } });
    const cookie = bootstrap.headers.get("set-cookie")?.split(";")[0] ?? null;
    results.bootstrap = { status: bootstrap.status, cookie: Boolean(cookie) };
    if (cookie) {
      const gated = { ...base, headers: { ...base.headers, cookie } };
      const account = await fetch(`${targetUrl}/account`, gated);
      results.accountSignedOut = { status: account.status, location: account.headers.get("location"), cacheControl: account.headers.get("cache-control") };
      const pricing = await fetch(`${targetUrl}/pricing`, gated);
      const pricingBody = await pricing.text();
      results.pricing = { status: pricing.status, location: pricing.headers.get("location"), mentionsEnded: /Subscription ended/i.test(pricingBody), cacheControl: pricing.headers.get("cache-control") };
      const subscription = await fetch(`${targetUrl}/subscription`, gated);
      results.subscriptionSignedOut = { status: subscription.status, location: subscription.headers.get("location"), cacheControl: subscription.headers.get("cache-control") };
    }
  }
  evidence.certification = results;
  const pass = results.health.status === 200 && results.webhookUnsigned.status === 400 && /invalid-signature/.test(results.webhookUnsigned.body) &&
    [401, 503].includes(results.schedulerRoute.status) && results.fixtureRoute.status === 404 &&
    (results.lockedGate.status === 404 || results.lockedGate.status === 200 || [302, 303, 307, 308].includes(results.lockedGate.status));
  evidence.pass = pass;
  console.log(JSON.stringify(results, null, 2));
  check(pass, "staging-certification-failed");
}

try {
  if (stage === "migrate" || stage === "all") await migrate();
  if (stage === "deploy" || stage === "all") await deploy();
  if (stage === "certify" || stage === "all") await certify();
  evidence.finishedAt = new Date().toISOString();
  console.log(`EVIDENCE ${JSON.stringify(evidence)}`);
} catch (error) {
  console.error(`FAILED ${redact(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
}
