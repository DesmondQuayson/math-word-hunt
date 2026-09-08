// Staging-only pipeline for the subscription lifecycle candidate.
//
//   --stage=migrate          link the STAGING Supabase project in a temporary
//                            work directory, capture billing row counts, push
//                            migrations, run the remote pgTAP suite once,
//                            verify the synchronizer exists, and confirm the
//                            row counts are unchanged.
//   --stage=webhook-config   prove the Stripe key is TEST mode, verify the
//                            sandbox product/price/portal, report every webhook
//                            endpoint that targets the staging host (URL, API
//                            version, enabled events vs required), add missing
//                            events on the TEST endpoint, and probe the
//                            configured URL for redirects.
//   --stage=cron-secret      generate a STAGING-only scheduler secret, store it
//                            in the staging Vercel project (CRON_SECRET) and in
//                            the local vault (CRON_SECRET_STAGING). Never reuses
//                            a production value.
//   --stage=deploy           deploy the candidate to the mathnexa-platform-staging
//                            Vercel project (preview target unless --alias) after
//                            proving the runtime tree equals the certified
//                            candidate commit, and wait for it to answer.
//   --stage=certify          probe the deployment: webhook refuses unsigned
//                            bodies, health answers, the scheduler route fails
//                            closed, the fixture route is absent, personalized
//                            pages are no-store, and the locked staging gate
//                            still hides pages.
//   --stage=lifecycle        Stripe TEST-CLOCK lifecycle against the hosted
//                            staging product: trial -> renewals 1-4 -> missed
//                            webhook self-heal -> drift audit dry run + controlled
//                            apply -> failed renewal + grace + recovery ->
//                            cancel at period end -> genuine expiration -> old
//                            canceled + new active, recording Stripe vs local
//                            vs UI vs product access at every step. Optional
//                            signed out-of-order/duplicate replays when the
//                            staging webhook secret is available.
//   --stage=sweep            call the scheduler route with the staging secret and
//                            record the aggregate result (fails closed without it).
//   --stage=reconcile-dry-run run the drift audit CLI read-only against staging.
//   --stage=all              migrate, webhook-config, cron-secret, deploy,
//                            certify, lifecycle, sweep, reconcile-dry-run.
//
// Only STAGING identifiers are hard-coded here. Production project refs are
// refused if they appear in the environment. Live Stripe keys are refused.
// Nothing is printed from any credential; command output is redacted before it
// is echoed. Every synthetic Stripe/Supabase object created here carries the
// rehearsal id in its metadata and is removed in the cleanup step.
import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const LEGACY_PRODUCTION_PROJECT_REF = "ioodoktlxvvmghyvevgn";
const STAGING_VERCEL_PROJECT = "mathnexa-platform-staging";
const STAGING_ORIGIN = "https://mathnexa-platform-staging.vercel.app";
const STAGING_HOST = "mathnexa-platform-staging.vercel.app";
const SCOPE = "bright-path-ed-tech";
const STRIPE_API_VERSION = "2026-07-29.dahlia";
const STRIPE_PRODUCT_ID = "prod_UzJVhdFFd8lNed";
const STRIPE_PRICE_ID = "price_1TzKso4YQNsZa1pjh5UZvcV7";
const STRIPE_PORTAL_ID = "bpc_1TzLQf4YQNsZa1pjhn4FayQy";
const REQUIRED_EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed", "customer.deleted"];
const CERTIFIED_CANDIDATE_COMMIT = "1e707ee";
const TRIAL_SECONDS = 86_400;
const HOUR = 3_600;
const DAY = 86_400;

const args = new Map(process.argv.slice(2).map((arg) => { const [key, value = "true"] = arg.split("=", 2); return [key, value]; }));
const stage = args.get("--stage") ?? "certify";
// Tee every console line into a log file (append) so long stages can be
// followed while they run; the parent shell's pipe buffering made the first
// hosted run invisible until exit.
const logFile = args.get("--log") ?? process.env.LIFECYCLE_LOG_FILE?.trim() ?? "";
if (logFile) {
  const { appendFileSync } = await import("node:fs");
  for (const method of ["log", "error"]) {
    const original = console[method].bind(console);
    console[method] = (...parts) => { original(...parts); try { appendFileSync(logFile, `${new Date().toISOString()} ${parts.map(String).join(" ")}\n`); } catch { /* best effort */ } };
  }
}
const step = (label) => console.log(`STEP ${new Date().toISOString()} ${label}`);
const alias = args.has("--alias");
const allowEndpointCreate = args.has("--allow-endpoint-create");
const targetUrl = args.get("--url") ?? STAGING_ORIGIN;
const repositoryRoot = resolve(process.cwd());
const supabaseCli = resolve("node_modules/supabase/dist/supabase.js");

function required(name, pattern = /\S/) {
  const value = process.env[name]?.trim() ?? "";
  if (!pattern.test(value)) throw new Error(`missing-${name.toLowerCase().replaceAll("_", "-")}`);
  return value;
}
const secrets = [];
function redact(value) {
  let safe = String(value ?? "");
  for (const secret of secrets) if (secret) safe = safe.replaceAll(secret, "[REDACTED]");
  return safe.replace(/(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9_]+/g, "[key]").replace(/sbp_[A-Za-z0-9_-]+/g, "[token]").replace(/whsec_[A-Za-z0-9]+/g, "[whsec]").replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[sbkey]");
}
function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { cwd: options.cwd ?? repositoryRoot, encoding: "utf8", env: options.env ?? process.env, input: options.input, stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"], shell: options.shell ?? false });
  if (result.status !== 0 && !options.allowFailure) throw new Error(`command-failed:${redact(`${result.stdout}\n${result.stderr}`).slice(-3000)}`);
  return options.allowFailure ? { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" } : result.stdout.trim();
}
function check(condition, code) { if (!condition) throw new Error(code); }
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function waitFor(label, read, accept, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await read();
    if (accept(last)) return last;
    await sleep(3_000);
  }
  throw new Error(`timeout:${label}:${redact(JSON.stringify(last ?? null)).slice(0, 400)}`);
}
const evidence = { stage, startedAt: new Date().toISOString() };
const iso = (seconds) => typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
const instant = (value) => typeof value === "string" ? Date.parse(value) : Number.NaN;
const shortId = (value) => value ? `…${String(value).slice(-6)}` : null;

function refuseProductionIdentifiers() {
  check(!Object.values(process.env).some((value) => typeof value === "string" && value.includes(LEGACY_PRODUCTION_PROJECT_REF)), "production-project-ref-present-refusing");
  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"]) {
    const value = process.env[name]?.trim();
    if (value) check(/^(sk|pk)_test_/.test(value), `${name.toLowerCase().replaceAll("_", "-")}-is-not-test-mode-refusing`);
  }
  for (const name of Object.keys(process.env)) check(!/_LIVE_|_PRODUCTION_/.test(name) || !process.env[name], `live-or-production-variable-loaded-refusing:${name}`);
}

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
  const projects = await fetch("https://api.supabase.com/v1/projects", { headers: { Authorization: `Bearer ${accessToken}` } });
  check(projects.ok, `management-token-rejected-${projects.status}`);
  const project = (await projects.json()).find((entry) => entry.ref === STAGING_PROJECT_REF);
  check(project, "staging-project-not-visible-to-token");
  evidence.stagingProject = { ref: project.ref, name: project.name, region: project.region, status: project.status };
  check(project.name === STAGING_VERCEL_PROJECT || /staging/i.test(project.name), "linked-project-is-not-staging-refusing");
  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-lifecycle-staging-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    const supabase = (commandArgs) => run(process.execPath, [supabaseCli, ...commandArgs, "--workdir", workRoot, "--yes"], {
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken, SUPABASE_DB_PASSWORD: databasePassword, SUPABASE_TELEMETRY_DISABLED: "true" }
    });
    const counts = () => managementQuery(accessToken, databasePassword,
      "select (select count(*) from public.billing_customers) as customers, (select count(*) from public.billing_subscriptions) as subscriptions, (select count(*) from public.consumer_game_entitlements) as entitlements, (select count(*) from public.billing_webhook_events) as receipts, (select count(*) from public.consumer_accounts) as accounts");
    const before = await counts();
    const versionsBefore = await managementQuery(accessToken, databasePassword, "select version from supabase_migrations.schema_migrations order by version desc limit 3");
    evidence.migrationVersionsBefore = versionsBefore.map((row) => row.version);
    check(!evidence.migrationVersionsBefore.includes("20260907130000") || args.has("--allow-reapply"), evidence.migrationVersionsBefore.includes("20260907130000") ? "migration-already-applied" : "ok");
    supabase(["link", "--project-ref", STAGING_PROJECT_REF]);
    const pushed = supabase(["db", "push", "--linked", "--include-all"]);
    evidence.pushOutput = redact(pushed).split("\n").filter((line) => /2026090713|Applying|Finished|up to date|Remote database is up to date/i.test(line)).slice(-6);
    const versionsAfter = await managementQuery(accessToken, databasePassword, "select version from supabase_migrations.schema_migrations order by version desc limit 3");
    evidence.migrationVersionsAfter = versionsAfter.map((row) => row.version);
    check(evidence.migrationVersionsAfter.includes("20260907130000"), "migration-version-not-recorded");
    const functions = await managementQuery(accessToken, databasePassword,
      "select proname from pg_proc where proname in ('synchronize_consumer_billing_subscription','mark_consumer_billing_reconciliation_attempt','apply_consumer_billing_projection','prepare_admin_account_operation') order by proname");
    evidence.functions = functions.map((row) => row.proname);
    check(evidence.functions.includes("synchronize_consumer_billing_subscription"), "synchronizer-missing-after-push");
    check(evidence.functions.includes("mark_consumer_billing_reconciliation_attempt"), "throttle-missing-after-push");
    const columns = await managementQuery(accessToken, databasePassword,
      "select table_name, column_name from information_schema.columns where table_schema='public' and ((table_name='billing_subscriptions' and column_name in ('ended_at','latest_invoice_id','last_synchronized_at','last_synchronization_source')) or (table_name='billing_customers' and column_name='last_reconciliation_attempt_at')) order by table_name, column_name");
    evidence.columns = columns.map((row) => `${row.table_name}.${row.column_name}`);
    check(evidence.columns.length === 5, "columns-missing-after-push");
    const constraints = await managementQuery(accessToken, databasePassword,
      "select conname, pg_get_constraintdef(oid) as definition from pg_constraint where conname in ('billing_webhook_events_event_type_check','billing_webhook_events_failure_class_check')");
    evidence.eventAlias = constraints.some((row) => row.conname === "billing_webhook_events_event_type_check" && row.definition.includes("invoice.payment_succeeded"));
    evidence.failureClasses = constraints.some((row) => row.conname === "billing_webhook_events_failure_class_check" && row.definition.includes("invoice_state_conflict") && row.definition.includes("conflicting_current_subscription"));
    check(evidence.eventAlias && evidence.failureClasses, "constraints-missing-after-push");
    const adminOperation = await managementQuery(accessToken, databasePassword, "select pg_get_functiondef('public.prepare_admin_account_operation'::regproc) like '%sync-billing%' as sync_billing");
    evidence.adminSyncOperation = adminOperation[0]?.sync_billing === true;
    check(evidence.adminSyncOperation, "admin-sync-operation-missing");
    const rls = await managementQuery(accessToken, databasePassword,
      "select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('billing_customers','billing_subscriptions','consumer_game_entitlements','billing_webhook_events') order by relname");
    evidence.rls = rls.map((row) => `${row.relname}:${row.relrowsecurity}/${row.relforcerowsecurity}`);
    check(rls.every((row) => row.relrowsecurity === true), "rls-disabled-after-push");
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

async function stripeClient() {
  const { default: Stripe } = await import("stripe");
  const key = required("STRIPE_SECRET_KEY", /^sk_test_/);
  secrets.push(key);
  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2 });
  const balance = await stripe.balance.retrieve();
  check(balance.livemode === false, "stripe-key-is-live-mode-refusing");
  evidence.stripeMode = "test";
  evidence.STAGING_LIVE_CHARGES_POSSIBLE = "NO";
  return stripe;
}

async function webhookConfig() {
  const stripe = await stripeClient();
  const [product, price, portal] = await Promise.all([
    stripe.products.retrieve(STRIPE_PRODUCT_ID), stripe.prices.retrieve(STRIPE_PRICE_ID), stripe.billingPortal.configurations.retrieve(STRIPE_PORTAL_ID)
  ]);
  evidence.sandboxResources = { product: { active: product.active, livemode: product.livemode }, price: { active: price.active, unitAmount: price.unit_amount, currency: price.currency, interval: price.recurring?.interval, product: price.product === STRIPE_PRODUCT_ID }, portal: { active: portal.active } };
  check(price.unit_amount === 599 && price.currency === "usd" && price.recurring?.interval === "month" && price.product === STRIPE_PRODUCT_ID && price.livemode === false, "sandbox-price-contract-mismatch");
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const report = endpoints.data.map((endpoint) => {
    const url = new URL(endpoint.url);
    const enabled = endpoint.enabled_events.includes("*") ? REQUIRED_EVENTS : endpoint.enabled_events;
    const missing = REQUIRED_EVENTS.filter((event) => !enabled.includes(event) && !(event === "invoice.paid" && enabled.includes("invoice.payment_succeeded")));
    return { id: shortId(endpoint.id), host: url.host, path: url.pathname, status: endpoint.status, apiVersion: endpoint.api_version, enabledEvents: endpoint.enabled_events.length, missingRequired: missing, staging: url.host === STAGING_HOST && url.pathname === "/api/billing/webhook", metadataEnvironment: endpoint.metadata?.environment ?? null };
  });
  evidence.webhookEndpoints = report;
  const stagingEndpoints = endpoints.data.filter((endpoint) => { const url = new URL(endpoint.url); return url.host === STAGING_HOST && url.pathname === "/api/billing/webhook"; });
  evidence.stagingEndpointCount = stagingEndpoints.length;
  for (const endpoint of stagingEndpoints) {
    const missing = REQUIRED_EVENTS.filter((event) => !endpoint.enabled_events.includes(event) && !endpoint.enabled_events.includes("*"));
    if (missing.length > 0) {
      await stripe.webhookEndpoints.update(endpoint.id, { enabled_events: [...new Set([...endpoint.enabled_events, ...missing])] });
      evidence.stagingEndpointEventsAdded = missing;
    }
    if (endpoint.api_version && endpoint.api_version !== STRIPE_API_VERSION) evidence.stagingEndpointApiVersionDrift = { configured: endpoint.api_version, runtime: STRIPE_API_VERSION };
    if (endpoint.status !== "enabled") { await stripe.webhookEndpoints.update(endpoint.id, { disabled: false }); evidence.stagingEndpointReenabled = true; }
  }
  if (stagingEndpoints.length === 0) {
    check(allowEndpointCreate, "no-staging-webhook-endpoint-pass-allow-endpoint-create-to-provision");
    const created = await stripe.webhookEndpoints.create({ url: `${STAGING_ORIGIN}/api/billing/webhook`, enabled_events: REQUIRED_EVENTS, api_version: STRIPE_API_VERSION, description: "MathNexa staging subscription lifecycle", metadata: { application: "mathnexa", environment: "staging", phase: "lifecycle" } });
    secrets.push(created.secret);
    storeVaultEntry("STRIPE_WEBHOOK_SECRET", created.secret);
    evidence.stagingEndpointCreated = { id: shortId(created.id), storedInVault: true, stagingVercelEnvUpdated: upsertStagingVercelEnvironment("STRIPE_WEBHOOK_SECRET", created.secret) };
  }
  const unsigned = await fetch(`${STAGING_ORIGIN}/api/billing/webhook`, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET.trim() } : {}) }, body: "{}" });
  evidence.configuredUrlProbe = { host: STAGING_HOST, status: unsigned.status, redirectLocation: unsigned.headers.get("location"), body: (await unsigned.text()).slice(0, 200) };
  check(unsigned.status === 400 && !/^3/.test(String(unsigned.status)), "configured-webhook-url-does-not-answer-400-for-unsigned");
  console.log(JSON.stringify({ webhookEndpoints: report, configuredUrlProbe: evidence.configuredUrlProbe }, null, 2));
}

function vercelBinary() { const configured = process.env.LIFECYCLE_VERCEL_CLI?.trim(); return configured || "npx"; }
function vercel(commandArgs, options = {}) {
  const binary = vercelBinary();
  return binary === "npx"
    ? run("npx", ["--no-install", "vercel", ...commandArgs], { shell: true, ...options })
    : run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", binary, ...commandArgs], options);
}
function upsertStagingVercelEnvironment(name, value) {
  vercel(["env", "rm", name, "production", "--yes", "--project", STAGING_VERCEL_PROJECT, "--scope", SCOPE], { allowFailure: true });
  vercel(["env", "add", name, "production", "--sensitive", "--project", STAGING_VERCEL_PROJECT, "--scope", SCOPE], { input: `${value}\n` });
  return true;
}
function storeVaultEntry(name, value) {
  const script = process.env.LIFECYCLE_VAULT_SET_SCRIPT?.trim();
  check(script, "vault-set-script-unavailable");
  run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Name", name], { env: { ...process.env, LIFECYCLE_VAULT_SECRET_VALUE: value } });
}

async function stagingEnvironment() {
  // The staging Vercel project carries its own copy of the Stripe TEST keys.
  // When the sandbox key is rotated (the 2026-08-02 key expired), the hosted
  // webhook fails every authoritative read with provider_unavailable until the
  // project's variables are refreshed. Test mode is re-proven before writing;
  // only the STAGING project is ever addressed.
  const secretKey = required("STRIPE_SECRET_KEY", /^sk_test_/);
  const publishableKey = required("STRIPE_PUBLISHABLE_KEY", /^pk_test_/);
  secrets.push(secretKey, publishableKey);
  await stripeClient();
  upsertStagingVercelEnvironment("STRIPE_SECRET_KEY", secretKey);
  upsertStagingVercelEnvironment("STRIPE_PUBLISHABLE_KEY", publishableKey);
  evidence.stagingEnvironment = { project: STAGING_VERCEL_PROJECT, updated: ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"], mode: "test", redeployRequired: true };
  console.log(JSON.stringify(evidence.stagingEnvironment));
}

function cronSecret() {
  const existing = process.env.CRON_SECRET_STAGING?.trim();
  const value = existing && existing.length >= 32 ? existing : randomBytes(32).toString("base64url");
  secrets.push(value);
  check(!Object.entries(process.env).some(([name, candidate]) => name !== "CRON_SECRET_STAGING" && candidate === value), "cron-secret-collides-with-another-loaded-value");
  upsertStagingVercelEnvironment("CRON_SECRET", value);
  if (!existing || existing !== value) storeVaultEntry("CRON_SECRET_STAGING", value);
  evidence.cronSecret = { generated: !existing, length: value.length, stagingVercelEnvUpdated: true, storedInVault: true, productionValueReused: false };
}

async function waitForOrigin(url, bypass, stagingToken = null) {
  // Preview deployments answer /api/health directly. The stable alias runs
  // behind the locked staging gate (404, empty body, for every route but the
  // Stripe webhook), so health is read through the gate cookie there.
  const deadline = Date.now() + 300_000;
  const headers = bypass ? { "x-vercel-protection-bypass": bypass } : {};
  let cookie = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`, { redirect: "manual", headers: cookie ? { ...headers, cookie } : headers });
      if (response.status === 200) return { ...(await response.json()), throughStagingGate: Boolean(cookie) };
      if (response.status === 404 && stagingToken && !cookie) {
        const bootstrap = await fetch(`${url}/api/internal/staging-access/bootstrap`, { method: "POST", redirect: "manual", headers: { ...headers, Authorization: `Bearer ${stagingToken}` } });
        cookie = bootstrap.headers.get("set-cookie")?.split(";")[0] ?? null;
        continue;
      }
    } catch { /* not ready */ }
    await sleep(5000);
  }
  throw new Error("deployment-not-ready");
}

async function deploy() {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || null;
  if (bypass) secrets.push(bypass);
  const tree = run("git", ["rev-parse", "HEAD^{tree}"]);
  const commit = run("git", ["rev-parse", "HEAD"]);
  const certified = run("git", ["rev-parse", CERTIFIED_CANDIDATE_COMMIT]);
  const runtimeDiff = run("git", ["diff", "--stat", certified, "HEAD", "--", "apps", "packages", "supabase", "package.json", "package-lock.json", "turbo.json", "tsconfig.json"]);
  check(runtimeDiff === "", `runtime-differs-from-certified-candidate:${runtimeDiff.slice(-600)}`);
  check(run("git", ["status", "--porcelain", "--", "apps", "packages", "supabase", "package.json", "package-lock.json"]) === "", "runtime-working-tree-dirty");
  evidence.runtimeEqualsCertifiedCandidate = certified;
  const commandArgs = ["deploy", ".", "--project", STAGING_VERCEL_PROJECT, "--scope", SCOPE, "--yes", "--meta", `candidateTree=${tree}`, "--meta", `candidateCommit=${commit}`, "--meta", `certifiedRuntime=${certified}`];
  if (alias) commandArgs.push("--prod");
  const output = vercel(commandArgs);
  // Vercel CLI 59 prints a JSON "next steps" block rather than a bare URL line, so
  // take the deployment-specific URL (hash + team suffix) from anywhere in the output.
  const urls = output.match(/https:\/\/[a-z0-9-]+\.vercel\.app/g) ?? [];
  const url = urls.filter((candidate) => new RegExp(`^https://${STAGING_VERCEL_PROJECT}-[a-z0-9]+-${SCOPE}\\.vercel\\.app$`).test(candidate)).pop() ?? null;
  check(url, `deployment-url-missing:${redact(output).slice(-500)}`);
  evidence.deploymentUrl = url; evidence.candidateTree = tree; evidence.candidateCommit = commit; evidence.aliasTarget = alias;
  const stagingToken = process.env.MVH_STAGING_ACCESS_TOKEN?.trim() || null;
  if (stagingToken) secrets.push(stagingToken);
  evidence.health = await waitForOrigin(alias ? STAGING_ORIGIN : url, bypass, stagingToken);
  const inspectField = (text, field) => text.split("\n").map((line) => line.trim()).find((line) => new RegExp(`^${field}\\s`).test(line))?.split(/\s+/).pop() ?? null;
  const inspect = vercel(["inspect", url, "--scope", SCOPE], { allowFailure: true });
  evidence.deployment = { id: inspectField(inspect.stdout, "id"), target: inspectField(inspect.stdout, "target"), status: inspectField(inspect.stdout, "status") };
  if (alias) {
    const aliasInspect = vercel(["inspect", STAGING_ORIGIN, "--scope", SCOPE], { allowFailure: true });
    evidence.aliasServes = inspectField(aliasInspect.stdout, "id");
    check(evidence.aliasServes && evidence.aliasServes === evidence.deployment.id, `alias-not-pointing-at-new-deployment:${evidence.aliasServes}!=${evidence.deployment.id}`);
  }
  console.log(JSON.stringify({ deploymentUrl: url, candidateCommit: commit, certifiedRuntime: certified, aliasTarget: alias }));
}

async function certify() {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || null;
  const stagingToken = process.env.MVH_STAGING_ACCESS_TOKEN?.trim() || null;
  if (bypass) secrets.push(bypass);
  if (stagingToken) secrets.push(stagingToken);
  const base = { redirect: "manual", headers: bypass ? { "x-vercel-protection-bypass": bypass } : {} };
  const results = {};
  // The stable alias is behind the locked staging gate: without its cookie every
  // page and internal route answers 404 with no body (recorded below as
  // lockedGate / lockedHealth). Only the Stripe webhook is exempt. Route
  // contracts are therefore probed with the gate cookie obtained from the
  // bootstrap endpoint, exactly as a staging operator would.
  const lockedHealth = await fetch(`${targetUrl}/api/health`, base);
  results.lockedHealth = { status: lockedHealth.status, bytes: (await lockedHealth.arrayBuffer()).byteLength };
  const unsigned = await fetch(`${targetUrl}/api/billing/webhook`, { ...base, method: "POST", headers: { ...base.headers, "content-type": "application/json" }, body: "{}" });
  results.webhookUnsigned = { status: unsigned.status, body: await unsigned.text(), redirectLocation: unsigned.headers.get("location") };
  const lockedAccount = await fetch(`${targetUrl}/account`, base);
  results.lockedGate = { status: lockedAccount.status, bytes: (await lockedAccount.arrayBuffer()).byteLength, cacheControl: lockedAccount.headers.get("cache-control") };
  let gateCookie = null;
  if (stagingToken) {
    const bootstrap = await fetch(`${targetUrl}/api/internal/staging-access/bootstrap`, { ...base, method: "POST", headers: { ...base.headers, Authorization: `Bearer ${stagingToken}` } });
    gateCookie = bootstrap.headers.get("set-cookie")?.split(";")[0] ?? null;
    results.bootstrap = { status: bootstrap.status, cookie: Boolean(gateCookie) };
  }
  const gatedBase = gateCookie ? { ...base, headers: { ...base.headers, cookie: gateCookie } } : base;
  const health = await fetch(`${targetUrl}/api/health`, gatedBase);
  results.health = { status: health.status, body: health.status === 200 ? await health.json() : null };
  const scheduler = await fetch(`${targetUrl}/api/internal/billing/reconcile`, gatedBase);
  results.schedulerRoute = { status: scheduler.status, body: await scheduler.text(), cacheControl: scheduler.headers.get("cache-control") };
  const fixture = await fetch(`${targetUrl}/api/internal/billing/fixture`, { ...gatedBase, method: "POST", headers: { ...gatedBase.headers, "content-type": "application/json" }, body: JSON.stringify({ action: "read-subscription", subscriptionId: "sub_x" }) });
  results.fixtureRoute = { status: fixture.status };
  if (gateCookie) {
    {
      const cookie = gateCookie;
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

// ---------------------------------------------------------------------------
// Hosted test-clock lifecycle
// ---------------------------------------------------------------------------
async function supabaseAdmin() {
  const { createClient } = await import("@supabase/supabase-js");
  const key = required("SUPABASE_SECRET_KEY", /^(sb_secret_|eyJ)/);
  secrets.push(key);
  // Every PostgREST call gets a hard timeout so a stalled connection surfaces as
  // an error instead of hanging a waitFor loop.
  const admin = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) }
  });
  const probe = await admin.from("billing_subscriptions").select("id", { head: true, count: "exact" });
  check(!probe.error, `staging-service-key-rejected:${probe.error?.message ?? ""}`);
  return admin;
}
async function single(admin, table, columns, column, value) {
  const result = await admin.from(table).select(columns).eq(column, value).maybeSingle();
  if (result.error) throw new Error(`db-read-failed:${table}:${result.error.message}`);
  return result.data;
}
const periodEnd = (subscription) => subscription.items?.data?.[0]?.current_period_end ?? subscription.current_period_end;
const objectId = (value) => typeof value === "string" ? value : value?.id ?? null;

function signedEvent(secret, type, object, createdSeconds, id = `evt_${randomUUID().replaceAll("-", "").slice(0, 24)}`) {
  const payload = JSON.stringify({ id, object: "event", api_version: STRIPE_API_VERSION, created: createdSeconds, livemode: false, type, pending_webhooks: 1, request: { id: null, idempotency_key: null }, data: { object } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return { id, payload, header: `t=${timestamp},v1=${signature}` };
}

async function lifecycle() {
  const bypass = required("VERCEL_AUTOMATION_BYPASS_SECRET");
  const stagingToken = required("MVH_STAGING_ACCESS_TOKEN");
  secrets.push(bypass, stagingToken);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
  if (webhookSecret) secrets.push(webhookSecret);
  const stripe = await stripeClient();
  const admin = await supabaseAdmin();
  const { chromium } = await import("@playwright/test");
  const runId = randomUUID().replaceAll("-", "");
  const email = `lifecycle-${runId.slice(0, 12)}@example.invalid`;
  const password = `Lc9!${runId.slice(0, 20)}Aa`;
  secrets.push(password);
  const metadata = { application: "mathnexa", environment: "staging", phase: "lifecycle", rehearsal_id: runId, mathnexa_plan: "mathnexa-monthly" };
  const rows = [];
  const resources = { userId: null, clockId: null, customerId: null, subscriptionIds: new Set() };
  const table = { renewals: [] };
  evidence.lifecycle = table;

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: STAGING_ORIGIN, extraHTTPHeaders: { "x-vercel-protection-bypass": bypass } });
  const page = await context.newPage();
  try {
    // ---- account + Stripe customer -------------------------------------------------
    step("create synthetic account");
    const created = await admin.auth.admin.createUser({ email, email_confirm: true, password, user_metadata: { rehearsal_id: runId } });
    check(!created.error && created.data.user, `user-create-failed:${created.error?.message ?? ""}`);
    resources.userId = created.data.user.id;
    metadata.mathnexa_account_id = resources.userId;
    const provisioned = await waitFor("consumer-account-provisioned", () => single(admin, "consumer_accounts", "user_id, created_at", "user_id", resources.userId), Boolean, 60_000);
    // The trial redemption claim (mirrored below) must not post-date the trial
    // start: parseGameEntitlementEvidence treats redeemed > startsAt as malformed,
    // and the real Checkout flow claims first and creates the subscription second.
    // So the clock is frozen at the claim instant, which is after the account row
    // was created (the account constraint requires trial_redeemed_at >= created_at).
    const initialTime = Math.max(Math.floor(Date.now() / 1000), Math.ceil(Date.parse(provisioned.created_at) / 1000) + 1);
    const clock = await stripe.testHelpers.testClocks.create({ frozen_time: initialTime, name: `MathNexa lifecycle ${runId.slice(0, 12)}` });
    resources.clockId = clock.id;
    const customer = await stripe.customers.create({ email, test_clock: clock.id, metadata });
    resources.customerId = customer.id;
    const goodMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: goodMethod.id } });
    const mapped = await admin.from("billing_customers").insert({ owner_consumer_id: resources.userId, stripe_environment: "test", stripe_customer_id: customer.id });
    check(!mapped.error, `customer-mapping-failed:${mapped.error?.message ?? ""}`);

    const waitClock = () => waitFor("test-clock-ready", () => stripe.testHelpers.testClocks.retrieve(clock.id), (value) => { if (value.status === "internal_failure") throw new Error("test-clock-internal-failure"); return value.status === "ready"; }, 300_000);
    const advance = async (target) => { await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: target }); const ready = await waitClock(); check(ready.frozen_time === target, "test-clock-target-mismatch"); };
    const cycleInvoice = (subscriptionId, minimumCreated, exclude) => waitFor("cycle-invoice", async () => {
      const list = await stripe.invoices.list({ customer: customer.id, subscription: subscriptionId, limit: 100 });
      return list.data.find((invoice) => !exclude.has(invoice.id) && invoice.billing_reason === "subscription_cycle" && invoice.created >= minimumCreated - 120) ?? null;
    }, Boolean);
    const finalize = async (invoice, expected) => {
      const current = await stripe.invoices.retrieve(invoice.id);
      if (current.status === "draft") { const now = await stripe.testHelpers.testClocks.retrieve(clock.id); await advance(Math.max(now.frozen_time + 1, current.created + HOUR + 5 * 60)); }
      return waitFor(`invoice-${expected}`, () => stripe.invoices.retrieve(invoice.id), (value) => expected === "paid" ? value.status === "paid" && value.amount_remaining === 0 : value.status === "open" && value.attempted && value.amount_remaining > 0, 300_000);
    };
    const entitlement = () => single(admin, "consumer_game_entitlements", "entitlement_state, trial_ends_at, current_period_ends_at, grace_ends_at, authoritative_version", "user_id", resources.userId);
    const localSubscription = (id) => single(admin, "billing_subscriptions", "subscription_status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, ended_at, latest_invoice_id, last_synchronized_at, last_synchronization_source, latest_authoritative_event_created_at", "stripe_subscription_id", id);

    // ---- browser session through the locked gate --------------------------------
    step("bootstrap staging gate and sign in");
    const bootstrap = await context.request.post(`${STAGING_ORIGIN}/api/internal/staging-access/bootstrap`, { headers: { Authorization: `Bearer ${stagingToken}` } });
    check(bootstrap.status() === 204, `staging-bootstrap-failed-${bootstrap.status()}`);
    await page.goto(`${STAGING_ORIGIN}/sign-in`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.origin === STAGING_ORIGIN && /^\/(account)?$/.test(url.pathname), { timeout: 60_000 });

    async function observe(label, subscriptionId, expectations) {
      const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
      const local = await localSubscription(subscriptionId);
      const ent = await entitlement();
      await page.goto(`${STAGING_ORIGIN}/account`, { waitUntil: "networkidle" });
      const accountText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      await page.goto(`${STAGING_ORIGIN}/subscription`, { waitUntil: "networkidle" });
      const statusLabel = (await page.getByTestId("consumer-subscription-label").first().innerText().catch(() => "")).trim();
      const subscriptionText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      await page.goto(`${STAGING_ORIGIN}/pricing`, { waitUntil: "networkidle" });
      const pricingText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      // Checkout is offered through the commercial consent form ("Accept terms and
      // continue to Stripe", disabled until every box is ticked); older copy is kept
      // in the pattern for safety.
      const startTrialButtons = (await page.locator("#commercial-consent-heading").count()) + (await page.getByRole("button", { name: /Accept terms and continue to Stripe|start trial|Add payment method/i }).count());
      const runtime = await page.request.get(`${STAGING_ORIGIN}/game/runtime/index.html`, { maxRedirects: 0 });
      const mapPrep = await page.request.get(`${STAGING_ORIGIN}/map-prep/launch`, { maxRedirects: 0 });
      const play = await page.request.get(`${STAGING_ORIGIN}/play`, { maxRedirects: 0 });
      await page.goto(`${STAGING_ORIGIN}/game-access`, { waitUntil: "networkidle" });
      const gameAccessText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      const gameAccessHeading = (await page.locator("main").getByRole("heading").first().innerText().catch(() => "")).trim();
      // innerText reflects CSS text-transform (the definition list renders labels in
      // capitals), so match case-insensitively and test "Unavailable" first.
      const accountUi = /game access\s*unavailable/i.test(accountText) ? "Unavailable" : /game access\s*available/i.test(accountText) ? "Available" : "unknown";
      const row = {
        GAME_ACCESS_PAGE: gameAccessHeading.slice(0, 80),
        ...(accountUi === "unknown" ? { ACCOUNT_SNIPPET: accountText.slice(0, 240) } : {}),
        step: label, subscription: shortId(subscriptionId),
        STRIPE_STATUS: stripeSub.status, STRIPE_PERIOD_END: iso(periodEnd(stripeSub)), STRIPE_CANCEL_AT_PERIOD_END: stripeSub.cancel_at_period_end,
        LOCAL_STATUS: local?.subscription_status ?? null, LOCAL_PERIOD_END: local?.current_period_end ?? null, LOCAL_SYNC_SOURCE: local?.last_synchronization_source ?? null,
        ENTITLEMENT: ent?.entitlement_state ?? null, ENTITLEMENT_PERIOD_END: ent?.current_period_ends_at ?? null, GRACE_ENDS_AT: ent?.grace_ends_at ?? null,
        ACCOUNT_UI: accountUi,
        SUBSCRIPTION_UI: statusLabel, SUBSCRIPTION_ENDED_MESSAGE: /Subscription ended/.test(`${accountText} ${subscriptionText} ${gameAccessText}`),
        PRICING_CTA: /Continue playing/.test(pricingText) ? "Continue playing" : /Manage subscription/.test(pricingText) ? "Manage subscription" : /Review subscription status/.test(pricingText) ? "Review subscription status" : startTrialButtons > 0 ? "Checkout offered" : "none",
        DOUBLE_SUBSCRIBE_POSSIBLE: startTrialButtons > 0,
        GAME_ACCESS: runtime.status() === 200 ? "ALLOWED" : `DENIED(${runtime.status()})`,
        MAP_PREP_ACCESS: /\/subscription/.test(mapPrep.headers().location ?? "") ? "DENIED" : "ALLOWED",
        PLAY_REDIRECT: play.headers().location ?? null
      };
      rows.push(row);
      console.log(`ROW ${JSON.stringify(row)}`);
      for (const [key, expected] of Object.entries(expectations)) {
        const actual = row[key];
        const ok = expected instanceof RegExp ? expected.test(String(actual)) : typeof expected === "function" ? expected(actual, row) : actual === expected;
        check(ok, `${label}:${key}:expected=${String(expected)}:actual=${String(actual)}`);
      }
      if (local && stripeSub.status !== "canceled") check(instant(local.current_period_end) === periodEnd(stripeSub) * 1000, `${label}:local-period-end-differs-from-stripe`);
      return row;
    }
    const entitled = { ACCOUNT_UI: "Available", GAME_ACCESS: "ALLOWED", MAP_PREP_ACCESS: "ALLOWED", SUBSCRIPTION_ENDED_MESSAGE: false, PRICING_CTA: "Continue playing", DOUBLE_SUBSCRIBE_POSSIBLE: false };

    // ---- trial ------------------------------------------------------------------------
    // Mirror the one account write the real Checkout activation performs before it
    // creates the trial subscription: the trial redemption claim. The access gate
    // treats a trial-active projection as a real trial only for an account whose
    // trial_redeemed_at is set (lib/repositories/consumer-entitlement.repository.ts),
    // exactly as a customer who came through Checkout.
    step("mirror checkout trial redemption claim, then create trial subscription on the test clock");
    const trialClaim = await admin.rpc("claim_consumer_trial_redemption", { p_owner_user_id: resources.userId, p_checkout_hash: createHash("sha256").update(`cs_lifecycle_${runId}`).digest("hex"), p_redeemed_at: new Date(initialTime * 1000).toISOString() });
    check(!trialClaim.error, `trial-redemption-claim-failed:${trialClaim.error?.message ?? ""}`);
    table.trialRedemptionMirrored = String(trialClaim.data);
    let subscription = await stripe.subscriptions.create({
      customer: customer.id, items: [{ price: STRIPE_PRICE_ID, quantity: 1 }], default_payment_method: goodMethod.id,
      collection_method: "charge_automatically", payment_behavior: "default_incomplete", payment_settings: { save_default_payment_method: "on_subscription" },
      metadata, trial_end: initialTime + TRIAL_SECONDS, trial_settings: { end_behavior: { missing_payment_method: "cancel" } }
    });
    resources.subscriptionIds.add(subscription.id);
    if (subscription.trial_start && subscription.trial_end !== subscription.trial_start + TRIAL_SECONDS) {
      subscription = await stripe.subscriptions.update(subscription.id, { trial_end: subscription.trial_start + TRIAL_SECONDS, trial_settings: { end_behavior: { missing_payment_method: "cancel" } }, proration_behavior: "none" });
    }
    const primaryId = subscription.id;
    await waitFor("trial-projection", entitlement, (value) => value?.entitlement_state === "trial-active");
    await observe("TRIAL", primaryId, { ...entitled, STRIPE_STATUS: "trialing", ENTITLEMENT: "trial-active", SUBSCRIPTION_UI: /Trial/ });

    // ---- payments 1..4 ------------------------------------------------------------------
    const seen = new Set([objectId(subscription.latest_invoice)].filter(Boolean));
    for (let payment = 1; payment <= 4; payment += 1) {
      step(`payment ${payment}: advance clock, finalize cycle invoice, wait for projection`);
      const before = await entitlement();
      const boundary = payment === 1 ? subscription.trial_end : periodEnd(subscription);
      await advance(boundary + 60);
      const draft = await cycleInvoice(primaryId, boundary, seen);
      const paid = await finalize(draft, "paid");
      seen.add(paid.id);
      check(paid.amount_paid === 599 && paid.currency === "usd", `payment-${payment}-amount-mismatch`);
      subscription = await stripe.subscriptions.retrieve(primaryId);
      await waitFor(`payment-${payment}-projection`, entitlement, (value) => value?.entitlement_state === "subscription-active" && instant(value.current_period_ends_at) === periodEnd(subscription) * 1000 && value.authoritative_version > (before?.authoritative_version ?? -1));
      const row = await observe(`PAYMENT_${payment}${payment === 1 ? "_FIRST_CHARGE" : `_RENEWAL_${payment - 1}`}`, primaryId, { ...entitled, STRIPE_STATUS: "active", ENTITLEMENT: "subscription-active", SUBSCRIPTION_UI: "Active" });
      table.renewals.push({ payment, invoice: shortId(paid.id), amountPaid: paid.amount_paid, periodEnd: row.STRIPE_PERIOD_END });
    }
    table.SECOND_SUCCESSFUL_RECURRING_RENEWAL = "ENTITLED";
    table.THIRD_AND_FOURTH_RENEWAL = "ENTITLED";

    // ---- missed webhook: stale local projection repaired by the access gate -------------
    step("missed-webhook simulation and self-heal");
    const stale = { start: new Date(Date.now() - 31 * DAY * 1000).toISOString(), end: new Date(Date.now() - 30_000).toISOString() };
    const staleSubscription = await admin.from("billing_subscriptions").update({ current_period_start: stale.start, current_period_end: stale.end, last_synchronized_at: stale.end, last_synchronization_source: "webhook" }).eq("stripe_subscription_id", primaryId);
    check(!staleSubscription.error, `stale-simulation-failed:${staleSubscription.error?.message ?? ""}`);
    const staleEntitlement = await admin.from("consumer_game_entitlements").update({ current_period_ends_at: stale.end }).eq("user_id", resources.userId);
    check(!staleEntitlement.error, `stale-entitlement-simulation-failed:${staleEntitlement.error?.message ?? ""}`);
    await admin.from("billing_customers").update({ last_reconciliation_attempt_at: null }).eq("stripe_customer_id", customer.id);
    const beforeHeal = await entitlement();
    check(instant(beforeHeal.current_period_ends_at) < Date.now(), "stale-simulation-not-in-past");
    const visitStartedAt = new Date().toISOString();
    await page.goto(`${STAGING_ORIGIN}/account`, { waitUntil: "networkidle" });
    const healedText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    const firstViewAvailable = !/game access\s*unavailable/i.test(healedText) && /game access\s*available/i.test(healedText);
    // Diagnostics for the report either way: what the row, the throttle claim and
    // the game-access page looked like right after the first view.
    const afterFirstView = await localSubscription(primaryId);
    const customerAfterFirstView = await single(admin, "billing_customers", "last_reconciliation_attempt_at", "stripe_customer_id", customer.id);
    await page.goto(`${STAGING_ORIGIN}/game-access`, { waitUntil: "networkidle" });
    const gameAccessAfterFirstView = (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 300);
    table.MISSED_WEBHOOK_FIRST_VIEW = {
      visitStartedAt, firstViewAvailable,
      rowAfterFirstView: { periodEnd: afterFirstView?.current_period_end ?? null, syncSource: afterFirstView?.last_synchronization_source ?? null, synchronizedAt: afterFirstView?.last_synchronized_at ?? null },
      reconciliationClaimedAt: customerAfterFirstView?.last_reconciliation_attempt_at ?? null,
      gameAccessPage: gameAccessAfterFirstView
    };
    console.log(`SELF_HEAL_FIRST_VIEW ${JSON.stringify(table.MISSED_WEBHOOK_FIRST_VIEW)}`);
    check(firstViewAvailable, `missed-webhook-self-heal-did-not-restore-access-on-first-view:${JSON.stringify(table.MISSED_WEBHOOK_FIRST_VIEW)}`);
    const healed = await waitFor("self-heal-projection", () => localSubscription(primaryId), (value) => value?.last_synchronization_source === "reconciliation" && instant(value.current_period_end) === periodEnd(subscription) * 1000, 60_000);
    table.MISSED_WEBHOOK_SELF_HEAL = { restoredOnFirstView: true, source: healed.last_synchronization_source, periodEnd: healed.current_period_end };
    await observe("MISSED_WEBHOOK_SELF_HEALED", primaryId, { ...entitled, STRIPE_STATUS: "active", ENTITLEMENT: "subscription-active", LOCAL_SYNC_SOURCE: "reconciliation" });

    // ---- drift audit: dry run must report MATCHED, then a controlled apply repairs a fresh stale row ----
    const reconcileEnv = { ...process.env, SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`, STRIPE_PRODUCT_MATHNEXA: STRIPE_PRODUCT_ID, STRIPE_PRICE_MATHNEXA_MONTHLY: STRIPE_PRICE_ID };
    const dryRun = run(process.execPath, ["scripts/consumer-billing-reconcile.mjs", "--environment=test", `--owner=${resources.userId}`], { env: reconcileEnv });
    check(/^MATCHED\s+1/m.test(dryRun) && /^MISMATCHED\s+0/m.test(dryRun), `dry-run-after-self-heal-not-matched:${redact(dryRun).slice(-400)}`);
    await admin.from("billing_subscriptions").update({ current_period_start: stale.start, current_period_end: stale.end }).eq("stripe_subscription_id", primaryId);
    await admin.from("consumer_game_entitlements").update({ current_period_ends_at: stale.end }).eq("user_id", resources.userId);
    const dryRunStale = run(process.execPath, ["scripts/consumer-billing-reconcile.mjs", "--environment=test", `--owner=${resources.userId}`], { env: reconcileEnv });
    check(/^MISMATCHED\s+1/m.test(dryRunStale) && /No writes were made/.test(dryRunStale), `dry-run-did-not-detect-stale:${redact(dryRunStale).slice(-400)}`);
    const applied = run(process.execPath, ["scripts/consumer-billing-reconcile.mjs", "--environment=test", `--owner=${resources.userId}`, "--apply"], { env: reconcileEnv });
    check(/APPLIED \/ FAILED\s+1 \/ 0/.test(applied), `apply-failed:${redact(applied).slice(-400)}`);
    const repaired = await localSubscription(primaryId);
    check(instant(repaired.current_period_end) === periodEnd(subscription) * 1000 && repaired.last_synchronization_source === "reconciliation", "apply-did-not-repair-period-end");
    table.DRIFT_AUDIT = { dryRunMatchedAfterSelfHeal: true, dryRunDetectedStale: true, controlledApplyRepaired: true, scope: "synthetic rehearsal subscription only" };

    // ---- signed replays: out-of-order and duplicate (needs the staging endpoint secret) ----
    if (webhookSecret) {
      const currentObject = await stripe.subscriptions.retrieve(primaryId);
      const staleCreated = initialTime + 10;
      const outOfOrder = signedEvent(webhookSecret, "customer.subscription.updated", { ...currentObject, status: "trialing", items: { ...currentObject.items, data: currentObject.items.data.map((item) => ({ ...item, current_period_start: initialTime, current_period_end: initialTime + TRIAL_SECONDS })) } }, staleCreated);
      const outOfOrderResponse = await fetch(`${STAGING_ORIGIN}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": outOfOrder.header, "x-vercel-protection-bypass": bypass }, body: outOfOrder.payload });
      const outOfOrderBody = await outOfOrderResponse.text();
      const afterOutOfOrder = await entitlement();
      const duplicate = signedEvent(webhookSecret, "customer.subscription.updated", currentObject, Math.floor(Date.now() / 1000));
      const first = await fetch(`${STAGING_ORIGIN}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": duplicate.header, "x-vercel-protection-bypass": bypass }, body: duplicate.payload });
      const second = await fetch(`${STAGING_ORIGIN}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": duplicate.header, "x-vercel-protection-bypass": bypass }, body: duplicate.payload });
      const receipt = await admin.from("billing_webhook_events").select("processing_state, failure_class").eq("stripe_event_id", duplicate.id).maybeSingle();
      const afterDuplicate = await entitlement();
      table.SIGNED_REPLAYS = { outOfOrder: { status: outOfOrderResponse.status, body: outOfOrderBody.slice(0, 120), entitlementUnchanged: afterOutOfOrder?.entitlement_state === "subscription-active" && instant(afterOutOfOrder.current_period_ends_at) === periodEnd(currentObject) * 1000 }, duplicate: { first: first.status, second: second.status, receipt: receipt.data ?? null, entitlementUnchanged: afterDuplicate?.entitlement_state === "subscription-active" } };
      if (outOfOrderResponse.status === 400) table.SIGNED_REPLAYS.skipped = "staging webhook secret in vault does not match the endpoint; covered by local e2e";
      else check(outOfOrderResponse.status === 200 && /stale_ignored/.test(outOfOrderBody) && table.SIGNED_REPLAYS.outOfOrder.entitlementUnchanged && first.status === 200 && second.status === 200 && table.SIGNED_REPLAYS.duplicate.entitlementUnchanged, `signed-replays-failed:${JSON.stringify(table.SIGNED_REPLAYS)}`);
    } else {
      table.SIGNED_REPLAYS = { skipped: "STRIPE_WEBHOOK_SECRET not loaded; out-of-order/duplicate proven by local e2e and pgTAP" };
    }

    // ---- payment 5 fails: grace, non-extending retry, recovery --------------------------
    step("payment 5 failure, grace, recovery");
    const failingMethod = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: failingMethod.id } });
    subscription = await stripe.subscriptions.update(primaryId, { default_payment_method: failingMethod.id, proration_behavior: "none" });
    const failedAt = periodEnd(subscription);
    await advance(failedAt + 60);
    const failedDraft = await cycleInvoice(primaryId, failedAt, seen);
    const failedInvoice = await finalize(failedDraft, "failed");
    seen.add(failedInvoice.id);
    const grace = await waitFor("grace-projection", entitlement, (value) => value?.entitlement_state === "subscription-grace-period" && Boolean(value.grace_ends_at));
    const graceRow = await observe("PAYMENT_5_FAILED_GRACE", primaryId, { ...entitled, STRIPE_STATUS: "past_due", ENTITLEMENT: "subscription-grace-period", SUBSCRIPTION_UI: /Payment requires attention/ });
    try { await stripe.invoices.pay(failedInvoice.id, { payment_method: failingMethod.id }); } catch { /* expected decline */ }
    await sleep(15_000);
    const graceAfterRetry = await entitlement();
    check(graceAfterRetry.grace_ends_at === grace.grace_ends_at, "grace-extended-by-retry");
    const failureRow = await single(admin, "billing_subscriptions", "last_payment_failed_at, renewal_grace_ends_at", "stripe_subscription_id", primaryId);
    const graceDays = (instant(grace.grace_ends_at) - instant(failureRow.last_payment_failed_at)) / (DAY * 1000);
    check(graceDays === 7 && failureRow.renewal_grace_ends_at === grace.grace_ends_at, `grace-window-not-seven-days:${graceDays}`);
    table.GRACE = { graceEndsAt: grace.grace_ends_at, graceDays, nonExtending: true, accessDuringGrace: graceRow.GAME_ACCESS };
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: goodMethod.id } });
    subscription = await stripe.subscriptions.update(primaryId, { default_payment_method: goodMethod.id, proration_behavior: "none" });
    const recovered = await stripe.invoices.pay(failedInvoice.id, { payment_method: goodMethod.id });
    check(recovered.status === "paid", "recovery-payment-not-paid");
    subscription = await stripe.subscriptions.retrieve(primaryId);
    await waitFor("recovery-projection", entitlement, (value) => value?.entitlement_state === "subscription-active" && instant(value.current_period_ends_at) === periodEnd(subscription) * 1000);
    await observe("PAYMENT_5_RECOVERED", primaryId, { ...entitled, STRIPE_STATUS: "active", ENTITLEMENT: "subscription-active", SUBSCRIPTION_UI: "Active" });

    // ---- cancel at period end, then genuine expiration ------------------------------------
    step("cancel at period end, then genuine expiration");
    subscription = await stripe.subscriptions.update(primaryId, { cancel_at_period_end: true });
    await waitFor("cancel-at-period-end-projection", entitlement, (value) => value?.entitlement_state === "subscription-canceled-through-period-end");
    await observe("CANCEL_AT_PERIOD_END", primaryId, { ...entitled, STRIPE_STATUS: "active", STRIPE_CANCEL_AT_PERIOD_END: true, ENTITLEMENT: "subscription-canceled-through-period-end", SUBSCRIPTION_UI: /Active until period end/ });
    await advance(periodEnd(subscription) + 60);
    subscription = await waitFor("stripe-canceled", () => stripe.subscriptions.retrieve(primaryId), (value) => value.status === "canceled", 300_000);
    await waitFor("expired-projection", entitlement, (value) => value?.entitlement_state === "subscription-expired");
    await observe("GENUINE_EXPIRATION", primaryId, { STRIPE_STATUS: "canceled", ENTITLEMENT: "subscription-expired", ACCOUNT_UI: "Unavailable", GAME_ACCESS: /DENIED/, MAP_PREP_ACCESS: "DENIED", SUBSCRIPTION_ENDED_MESSAGE: true, SUBSCRIPTION_UI: "Ended", PRICING_CTA: "Checkout offered" });
    table.GENUINE_EXPIRATION = "REVOKED_HONESTLY";

    // ---- old canceled + new active ----------------------------------------------------------
    step("old canceled + new active");
    const replacement = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: STRIPE_PRICE_ID, quantity: 1 }], default_payment_method: goodMethod.id, collection_method: "charge_automatically", payment_behavior: "error_if_incomplete", payment_settings: { save_default_payment_method: "on_subscription" }, metadata });
    resources.subscriptionIds.add(replacement.id);
    await waitFor("replacement-projection", entitlement, (value) => value?.entitlement_state === "subscription-active" && instant(value.current_period_ends_at) === periodEnd(replacement) * 1000);
    const oldRow = await localSubscription(primaryId);
    check(oldRow.subscription_status === "canceled", "old-subscription-not-canceled-locally");
    await observe("OLD_CANCELED_NEW_ACTIVE", replacement.id, { ...entitled, STRIPE_STATUS: "active", ENTITLEMENT: "subscription-active", SUBSCRIPTION_UI: "Active" });
    if (webhookSecret && !table.SIGNED_REPLAYS.skipped) {
      const lateOld = signedEvent(webhookSecret, "customer.subscription.deleted", subscription, Math.floor(Date.now() / 1000));
      const late = await fetch(`${STAGING_ORIGIN}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": lateOld.header, "x-vercel-protection-bypass": bypass }, body: lateOld.payload });
      const afterLate = await entitlement();
      table.LATE_OLD_SUBSCRIPTION_EVENT = { status: late.status, body: (await late.text()).slice(0, 120), entitlementUnchanged: afterLate?.entitlement_state === "subscription-active" };
      check(late.status === 200 && table.LATE_OLD_SUBSCRIPTION_EVENT.entitlementUnchanged, "late-old-subscription-event-revoked-new-access");
    }
    table.rows = rows;
    table.pass = true;
  } finally {
    table.rows = table.rows ?? rows;
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    const cleanup = { subscriptionsCanceled: 0, clockDeleted: false, userDeleted: false, rowsRemaining: null, recentReceipts: null };
    try {
      // Diagnostic only (redacted): how the hosted webhook processed this run's events.
      const receipts = await admin.from("billing_webhook_events").select("event_type, processing_state, failure_class, attempt_count, received_at").order("received_at", { ascending: false }).limit(8);
      cleanup.recentReceipts = receipts.data?.map((row) => `${row.event_type}:${row.processing_state}${row.failure_class ? `(${row.failure_class})` : ""}x${row.attempt_count}`) ?? null;
    } catch { cleanup.recentReceipts = null; }
    for (const id of resources.subscriptionIds) { try { const current = await stripe.subscriptions.retrieve(id); if (current.status !== "canceled") { await stripe.subscriptions.cancel(id); cleanup.subscriptionsCanceled += 1; } } catch { /* already gone */ } }
    if (resources.clockId) { try { await stripe.testHelpers.testClocks.del(resources.clockId); cleanup.clockDeleted = true; } catch (error) { cleanup.clockError = redact(error.message); } }
    if (resources.userId) {
      const deleted = await admin.auth.admin.deleteUser(resources.userId);
      cleanup.userDeleted = !deleted.error;
      const remaining = await admin.from("billing_customers").select("id", { head: true, count: "exact" }).eq("owner_consumer_id", resources.userId);
      cleanup.rowsRemaining = remaining.count ?? null;
    }
    table.cleanup = cleanup;
    console.log(`CLEANUP ${JSON.stringify(cleanup)}`);
  }
}

async function cleanupOrphans() {
  // Removes rehearsal leftovers from an interrupted lifecycle run: Stripe TEST
  // clocks named by this harness (deleting a clock deletes its customers and
  // subscriptions) and staging auth users with the synthetic
  // lifecycle-*@example.invalid address (cascades to billing rows). Nothing else
  // is touched; every deletion is listed in the evidence.
  const stripe = await stripeClient();
  const admin = await supabaseAdmin();
  const removed = { clocks: 0, users: 0 };
  const clocks = await stripe.testHelpers.testClocks.list({ limit: 100 });
  for (const clock of clocks.data) {
    if (!/^MathNexa lifecycle /.test(clock.name ?? "")) continue;
    await stripe.testHelpers.testClocks.del(clock.id);
    removed.clocks += 1;
  }
  let page = 1;
  for (;;) {
    const users = await admin.auth.admin.listUsers({ page, perPage: 200 });
    check(!users.error, `list-users-failed:${users.error?.message ?? ""}`);
    for (const user of users.data.users) {
      if (!/^lifecycle-[a-f0-9]{12}@example\.invalid$/.test(user.email ?? "")) continue;
      const deleted = await admin.auth.admin.deleteUser(user.id);
      check(!deleted.error, `delete-user-failed:${deleted.error?.message ?? ""}`);
      removed.users += 1;
    }
    if (users.data.users.length < 200) break;
    page += 1;
  }
  evidence.cleanupOrphans = removed;
  console.log(JSON.stringify({ cleanupOrphans: removed }));
}

async function sweep() {
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || null;
  if (bypass) secrets.push(bypass);
  const secret = process.env.CRON_SECRET_STAGING?.trim() || null;
  if (secret) secrets.push(secret);
  const stagingToken = process.env.MVH_STAGING_ACCESS_TOKEN?.trim() || null;
  if (stagingToken) secrets.push(stagingToken);
  const headers = bypass ? { "x-vercel-protection-bypass": bypass } : {};
  // The locked staging gate answers 404 without its cookie; record that, then
  // probe the route contract through the gate the way a staging operator would.
  const locked = await fetch(`${STAGING_ORIGIN}/api/internal/billing/reconcile`, { headers, redirect: "manual" });
  evidence.sweepLockedGate = { status: locked.status, bytes: (await locked.arrayBuffer()).byteLength };
  if (stagingToken) {
    const bootstrap = await fetch(`${STAGING_ORIGIN}/api/internal/staging-access/bootstrap`, { method: "POST", redirect: "manual", headers: { ...headers, Authorization: `Bearer ${stagingToken}` } });
    const cookie = bootstrap.headers.get("set-cookie")?.split(";")[0] ?? null;
    if (cookie) headers.cookie = cookie;
  }
  const closed = await fetch(`${STAGING_ORIGIN}/api/internal/billing/reconcile`, { headers, redirect: "manual" });
  const wrong = await fetch(`${STAGING_ORIGIN}/api/internal/billing/reconcile`, { headers: { ...headers, Authorization: "Bearer not-the-secret-value-at-all" }, redirect: "manual" });
  evidence.sweep = { withoutBearer: { status: closed.status, body: (await closed.text()).slice(0, 120) }, wrongBearer: { status: wrong.status, body: (await wrong.text()).slice(0, 120) } };
  if (!secret) { evidence.sweep.authorized = "skipped: CRON_SECRET_STAGING not in vault (run --stage=cron-secret then redeploy)"; console.log(JSON.stringify(evidence.sweep, null, 2)); return; }
  const authorized = await fetch(`${STAGING_ORIGIN}/api/internal/billing/reconcile`, { headers: { ...headers, Authorization: `Bearer ${secret}` }, redirect: "manual" });
  const body = await authorized.text();
  evidence.sweep.authorized = { status: authorized.status, body: redact(body).slice(0, 600) };
  check(authorized.status === 200 && closed.status === 401 && wrong.status === 401, `sweep-route-contract-failed:${JSON.stringify(evidence.sweep)}`);
  console.log(JSON.stringify(evidence.sweep, null, 2));
}

async function reconcileDryRun() {
  const key = required("SUPABASE_SECRET_KEY", /^(sb_secret_|eyJ)/);
  const stripeKey = required("STRIPE_SECRET_KEY", /^sk_test_/);
  secrets.push(key, stripeKey);
  const output = run(process.execPath, ["scripts/consumer-billing-reconcile.mjs", "--environment=test"], { env: { ...process.env, SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`, STRIPE_PRODUCT_MATHNEXA: STRIPE_PRODUCT_ID, STRIPE_PRICE_MATHNEXA_MONTHLY: STRIPE_PRICE_ID } });
  evidence.reconcileDryRun = redact(output).split("\n").filter((line) => /TOTAL|MATCHED|MISMATCHED|SELF-REPAIRABLE|AMBIGUOUS|REQUIRES|No writes/.test(line));
  console.log(redact(output));
}

try {
  refuseProductionIdentifiers();
  const stages = stage === "all" ? ["migrate", "webhook-config", "staging-env", "cron-secret", "deploy", "certify", "lifecycle", "sweep", "reconcile-dry-run"] : [stage];
  for (const current of stages) {
    if (current === "migrate") await migrate();
    else if (current === "webhook-config") await webhookConfig();
    else if (current === "staging-env") await stagingEnvironment();
    else if (current === "cron-secret") cronSecret();
    else if (current === "deploy") await deploy();
    else if (current === "certify") await certify();
    else if (current === "lifecycle") await lifecycle();
    else if (current === "cleanup-orphans") await cleanupOrphans();
    else if (current === "sweep") await sweep();
    else if (current === "reconcile-dry-run") await reconcileDryRun();
    else throw new Error(`unknown-stage:${current}`);
  }
  evidence.finishedAt = new Date().toISOString();
  const evidencePath = join(tmpdir(), `mathnexa-lifecycle-evidence-${Date.now()}.json`);
  writeFileSync(evidencePath, redact(JSON.stringify(evidence, null, 2)));
  console.log(`EVIDENCE_FILE ${evidencePath}`);
  console.log(`EVIDENCE ${redact(JSON.stringify(evidence))}`);
} catch (error) {
  console.error(`FAILED ${redact(error instanceof Error ? error.message : String(error))}`);
  if (evidence.lifecycle) console.error(`PARTIAL ${redact(JSON.stringify(evidence.lifecycle))}`);
  process.exitCode = 1;
}
