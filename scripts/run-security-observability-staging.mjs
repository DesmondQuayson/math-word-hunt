// Staging-only pipeline for the PH2-07 security observability read path.
//
//   --stage=migrate   link the STAGING Supabase project in a temporary work
//                     directory, push migrations (adds the security event
//                     store), run the remote pgTAP suite once, and verify the
//                     seven functions and three tables exist.
//   --stage=pgtap-remote  run the pgTAP assertions of the security store test
//                     through the management API (one per call) for hosts
//                     without a Docker daemon; removes its fixtures afterwards.
//   --stage=env       set MVH_SECURITY_EVENT_SINK=database on the staging
//                     Vercel project and generate a STAGING-only drain secret
//                     (MVH_SECURITY_DRAIN_SECRET), storing it in the local
//                     vault as SECURITY_DRAIN_SECRET_STAGING. Never reuses a
//                     production value. Does not touch the staging gate.
//   --stage=deploy    deploy the candidate to mathnexa-platform-staging
//                     (production target of the STAGING project) after proving
//                     the tree is clean, and wait for it to answer.
//   --stage=certify   probe the deployment: ingest refuses unsigned and
//                     mis-signed deliveries, accepts a signed synthetic
//                     delivery and stores it idempotently, the retention route
//                     fails closed and purges nothing new, unsigned webhook
//                     posts produce real STAGING events and a real STAGING
//                     alert, the store holds redacted rows only, and the
//                     locked staging gate still hides pages. Records latency
//                     samples for the sign-in, authorization and webhook paths.
//   --stage=all       migrate, env, deploy, certify.
//
// Only STAGING identifiers are hard-coded here. Production project refs are
// refused if they appear in the environment. Nothing is printed from any
// credential; command output is redacted before it is echoed.
import { spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const LEGACY_PRODUCTION_PROJECT_REF = "ioodoktlxvvmghyvevgn";
const STAGING_VERCEL_PROJECT = "mathnexa-platform-staging";
const STAGING_VERCEL_PROJECT_ID = "prj_O61Cyx9WMjc0jljpM9erCiSXsJA0";
const STAGING_ORIGIN = "https://mathnexa-platform-staging.vercel.app";
const SCOPE = "bright-path-ed-tech";
const MIGRATION_VERSION = "20260909010000";
const EXPECTED_FUNCTIONS = [
  "claim_security_alert", "count_security_events_since", "purge_security_events", "record_security_alert",
  "record_security_events", "security_pipeline_health", "summarize_security_events"
];

const args = new Map(process.argv.slice(2).map((arg) => { const [key, value = "true"] = arg.split("=", 2); return [key, value]; }));
const stage = args.get("--stage") ?? "certify";
const logFile = args.get("--log") ?? process.env.LIFECYCLE_LOG_FILE?.trim() ?? "";
if (logFile) {
  const { appendFileSync } = await import("node:fs");
  for (const method of ["log", "error"]) {
    const original = console[method].bind(console);
    console[method] = (...parts) => { original(...parts); try { appendFileSync(logFile, `${new Date().toISOString()} ${parts.map(String).join(" ")}\n`); } catch { /* best effort */ } };
  }
}
const step = (label) => console.log(`STEP ${new Date().toISOString()} ${label}`);
const targetUrl = (args.get("--url") ?? STAGING_ORIGIN).replace(/\/$/, "");
const repositoryRoot = resolve(process.cwd());
const webRoot = resolve(repositoryRoot, "apps/platform-web");
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
  return safe.replace(/sbp_[A-Za-z0-9_-]+/g, "[token]").replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[sbkey]").replace(/Bearer [A-Za-z0-9._-]+/g, "Bearer [redacted]");
}
function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { cwd: options.cwd ?? repositoryRoot, encoding: "utf8", env: options.env ?? process.env, input: options.input, stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"], shell: options.shell ?? false });
  if (result.status !== 0 && !options.allowFailure) throw new Error(`command-failed:${redact(`${result.stdout}\n${result.stderr}`).slice(-3000)}`);
  return options.allowFailure ? { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" } : (result.stdout ?? "").trim();
}
function check(condition, code) { if (!condition) throw new Error(code); }
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const evidence = { stage, startedAt: new Date().toISOString(), target: targetUrl };

function refuseProductionIdentifiers() {
  check(!Object.values(process.env).some((value) => typeof value === "string" && value.includes(LEGACY_PRODUCTION_PROJECT_REF)), "production-project-ref-present-refusing");
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

function vercelCli() {
  return process.env.LIFECYCLE_VERCEL_CLI?.trim() || "npx";
}
function vercel(commandArgs, options = {}) {
  const cli = vercelCli();
  const prefix = cli === "npx" ? ["vercel", ...commandArgs] : commandArgs;
  // Both `npx` and a `.cmd` shim need a shell on Windows.
  return run(cli, [...prefix, "--scope", SCOPE], { cwd: webRoot, shell: true, ...options });
}

function assertLinkedToStaging() {
  const linkPath = join(webRoot, ".vercel", "project.json");
  check(existsSync(linkPath), "web-app-not-linked-to-vercel");
  const link = JSON.parse(readFileSync(linkPath, "utf8"));
  check(link.projectId === STAGING_VERCEL_PROJECT_ID && link.projectName === STAGING_VERCEL_PROJECT, "linked-project-is-not-staging-refusing");
  evidence.linkedProject = { id: link.projectId, name: link.projectName };
}

async function migrate() {
  refuseProductionIdentifiers();
  const accessToken = required("SUPABASE_ACCESS_TOKEN", /^sbp_/);
  const databasePassword = required("SUPABASE_DB_PASSWORD", /^.{16,}$/);
  secrets.push(accessToken, databasePassword);
  const projects = await fetch("https://api.supabase.com/v1/projects", { headers: { Authorization: `Bearer ${accessToken}` } });
  check(projects.ok, `management-token-rejected-${projects.status}`);
  const project = (await projects.json()).find((entry) => entry.ref === STAGING_PROJECT_REF);
  check(project, "staging-project-not-visible-to-token");
  check(project.name === STAGING_VERCEL_PROJECT || /staging/i.test(project.name), "linked-project-is-not-staging-refusing");
  evidence.stagingProject = { ref: project.ref, name: project.name, region: project.region, status: project.status };
  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-security-observability-staging-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    const supabase = (commandArgs) => run(process.execPath, [supabaseCli, ...commandArgs, "--workdir", workRoot, "--yes"], {
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken, SUPABASE_DB_PASSWORD: databasePassword, SUPABASE_TELEMETRY_DISABLED: "true" }
    });
    const versionsBefore = await managementQuery(accessToken, databasePassword, "select version from supabase_migrations.schema_migrations order by version desc limit 3");
    evidence.migrationVersionsBefore = versionsBefore.map((row) => row.version);
    const counts = () => managementQuery(accessToken, databasePassword,
      "select (select count(*) from public.billing_customers) as customers, (select count(*) from public.billing_subscriptions) as subscriptions, (select count(*) from public.consumer_game_entitlements) as entitlements, (select count(*) from public.consumer_accounts) as accounts, (select count(*) from public.admin_audit_log) as audit");
    const before = await counts();
    if (!evidence.migrationVersionsBefore.includes(MIGRATION_VERSION)) {
      step("link staging project");
      supabase(["link", "--project-ref", STAGING_PROJECT_REF]);
      step("push migrations");
      const pushed = supabase(["db", "push", "--linked", "--include-all"]);
      evidence.pushOutput = redact(pushed).split("\n").filter((line) => new RegExp(`${MIGRATION_VERSION}|Applying|Finished|up to date`, "i").test(line)).slice(-6);
    } else {
      evidence.pushOutput = ["migration-already-applied"];
      supabase(["link", "--project-ref", STAGING_PROJECT_REF]);
    }
    const versionsAfter = await managementQuery(accessToken, databasePassword, "select version from supabase_migrations.schema_migrations order by version desc limit 3");
    evidence.migrationVersionsAfter = versionsAfter.map((row) => row.version);
    check(evidence.migrationVersionsAfter.includes(MIGRATION_VERSION), "migration-version-not-recorded");
    const functions = await managementQuery(accessToken, databasePassword,
      `select proname from pg_proc where proname in (${EXPECTED_FUNCTIONS.map((name) => `'${name}'`).join(",")}) order by proname`);
    evidence.functions = functions.map((row) => row.proname);
    for (const name of EXPECTED_FUNCTIONS) check(evidence.functions.includes(name), `function-missing-after-push:${name}`);
    const tables = await managementQuery(accessToken, databasePassword,
      "select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('security_events','security_alerts','security_alert_state') order by relname");
    evidence.tables = tables;
    check(tables.length === 3 && tables.every((row) => row.relrowsecurity && row.relforcerowsecurity), "security-tables-missing-or-unprotected");
    step("pgTAP");
    const pgtap = run(process.execPath, [supabaseCli, "test", "db", "--linked", "--workdir", workRoot, "--yes"], {
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken, SUPABASE_DB_PASSWORD: databasePassword, SUPABASE_TELEMETRY_DISABLED: "true" }, allowFailure: true
    });
    evidence.pgtap = { status: pgtap.status, tail: redact(`${pgtap.stdout}\n${pgtap.stderr}`).split("\n").filter((line) => /21_security_observability|ok \d+|not ok|Failed|All tests|Result|passed|failed/i.test(line)).slice(-12) };
    check(pgtap.status === 0, "pgtap-failed");
    const after = await counts();
    check(JSON.stringify(before) === JSON.stringify(after), "business-row-counts-changed-by-migration");
    evidence.rowCountsUnchanged = true;
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

/**
 * Runs the pgTAP assertions of 21_security_observability.test.sql against the
 * STAGING database through the management API, one assertion per call, for
 * hosts where `supabase test db` cannot run (it needs a Docker daemon for
 * pg_prove). The file relies on ROLLBACK for cleanup, so the fixtures it
 * creates are removed explicitly afterwards.
 */
async function pgtapRemote() {
  refuseProductionIdentifiers();
  const accessToken = required("SUPABASE_ACCESS_TOKEN", /^sbp_/);
  const databasePassword = required("SUPABASE_DB_PASSWORD", /^.{16,}$/);
  secrets.push(accessToken, databasePassword);
  const query = (sql) => managementQuery(accessToken, databasePassword, sql);
  const source = readFileSync(resolve("supabase/tests/database/21_security_observability.test.sql"), "utf8").replace(/\r\n/g, "\n");
  const statements = source.split(/;\n/).map((statement) => statement.trim())
    .filter((statement) => /^select\s/i.test(statement) && !/^select\s+(no_plan\(\)|\*\s+from\s+finish\(\))/i.test(statement));
  await query("create extension if not exists pgtap with schema extensions");
  const lines = [];
  try {
    for (const statement of statements) {
      const rows = await query(`select no_plan(); ${statement}`);
      lines.push(rows.map((row) => String(Object.values(row)[0] ?? "")).join(" | ") || "(no output)");
    }
  } finally {
    await query("delete from public.security_alerts where rule_key = 'pgtap-rule'");
    await query("delete from public.security_alert_state where rule_key = 'pgtap-rule'");
    await query("delete from public.security_events where correlation_id like 'pgtap-correlation-%'");
  }
  const ok = lines.filter((line) => /^ok\b/.test(line)).length;
  const notOk = lines.filter((line) => !/^ok\b/.test(line));
  evidence.pgtapRemote = { assertions: statements.length, ok, notOk };
  check(notOk.length === 0 && ok === statements.length, `pgtap-remote-assertions-failed:${notOk.length}`);
}

function setStagingEnv(name, value) {
  // Removes then adds, always through stdin (never a shell pipe that appends a
  // newline — the MN-09 lesson), on the production target of the STAGING project.
  vercel(["env", "rm", name, "production", "--yes"], { allowFailure: true });
  vercel(["env", "add", name, "production"], { input: value });
}

async function configureEnv() {
  refuseProductionIdentifiers();
  assertLinkedToStaging();
  step("sink mode");
  setStagingEnv("MVH_SECURITY_EVENT_SINK", "database");
  step("drain secret");
  let drainSecret = process.env.SECURITY_DRAIN_SECRET_STAGING?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(drainSecret)) {
    drainSecret = randomBytes(32).toString("base64url");
    const setScript = required("LIFECYCLE_VAULT_SET_SCRIPT");
    run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", setScript, "-Name", "SECURITY_DRAIN_SECRET_STAGING"], {
      env: { ...process.env, LIFECYCLE_VAULT_SECRET_VALUE: drainSecret }
    });
    evidence.drainSecret = "generated-and-stored-in-vault";
  } else {
    evidence.drainSecret = "reused-from-vault";
  }
  secrets.push(drainSecret);
  setStagingEnv("MVH_SECURITY_DRAIN_SECRET", drainSecret);
  const listing = vercel(["env", "ls", "production"]);
  evidence.stagingEnvironmentNames = listing.split("\n").map((line) => line.trim().split(/\s+/)[0]).filter((name) => /^(MVH_SECURITY_|MVH_STAGING_ACCESS_REQUIRED|CRON_SECRET)/.test(name));
  check(evidence.stagingEnvironmentNames.includes("MVH_SECURITY_EVENT_SINK") && evidence.stagingEnvironmentNames.includes("MVH_SECURITY_DRAIN_SECRET"), "security-variables-not-listed");
}

async function deploy() {
  refuseProductionIdentifiers();
  assertLinkedToStaging();
  const status = run("git", ["status", "--porcelain"]);
  check(status === "", "working-tree-dirty-refusing");
  evidence.commit = run("git", ["rev-parse", "HEAD"]);
  evidence.tree = run("git", ["rev-parse", "HEAD^{tree}"]);
  step("deploy");
  const output = vercel(["deploy", "--prod", "--yes"], { allowFailure: true });
  const combined = `${output.stdout}\n${output.stderr}`;
  check(output.status === 0, `deploy-failed:${redact(combined).slice(-1500)}`);
  const deploymentUrl = combined.match(/https:\/\/[a-z0-9-]+\.vercel\.app/g)?.find((url) => url.includes("mathnexa-platform-staging")) ?? null;
  evidence.deploymentUrl = deploymentUrl;
  const inspect = vercel(["inspect", deploymentUrl ?? STAGING_ORIGIN], { allowFailure: true });
  evidence.deploymentId = (`${inspect.stdout}\n${inspect.stderr}`.match(/dpl_[A-Za-z0-9]+/) ?? [null])[0];
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const health = await fetch(`${targetUrl}/api/health`, { redirect: "manual" }).catch(() => null);
    if (health && (health.status === 200 || health.status === 404)) { evidence.healthStatus = health.status; break; }
    await sleep(5_000);
  }
}

const drainSignature = (body, secret) => createHmac("sha1", secret).update(body).digest("hex");
async function probe(path, init = {}) {
  const started = performance.now();
  const response = await fetch(`${targetUrl}${path}`, { redirect: "manual", ...init });
  const text = await response.text();
  return { status: response.status, body: text.slice(0, 300), ms: Math.round(performance.now() - started), headers: Object.fromEntries(response.headers) };
}

async function certify() {
  refuseProductionIdentifiers();
  const accessToken = required("SUPABASE_ACCESS_TOKEN", /^sbp_/);
  const databasePassword = required("SUPABASE_DB_PASSWORD", /^.{16,}$/);
  const drainSecret = required("SECURITY_DRAIN_SECRET_STAGING", /^[A-Za-z0-9_-]{43}$/);
  const cronSecret = process.env.CRON_SECRET_STAGING?.trim() ?? "";
  secrets.push(accessToken, databasePassword, drainSecret, cronSecret);
  const query = (sql) => managementQuery(accessToken, databasePassword, sql);
  const results = {};

  step("staging gate still locked");
  for (const path of ["/", "/sign-in", "/account", "/admin", "/sign-in.png"]) {
    const response = await probe(path);
    results[`gate ${path}`] = { status: response.status, bytes: response.body.length };
    check(response.status === 404 && response.body.length === 0, `staging-gate-open:${path}`);
  }

  step("ingest refuses unsigned and mis-signed deliveries");
  const line = JSON.stringify({ category: "billing", severity: "warning", code: "webhook-signature-invalid", correlationId: `certify-drain-${Date.now()}`, detail: { reason: "verification-failed", synthetic: true, scenario: "certify-drain", deployment: "staging" }, eventId: randomBytes(16).toString("hex"), emittedAt: new Date().toISOString() });
  const delivery = JSON.stringify([{ id: "certify", message: line, timestamp: Date.now(), source: "lambda", type: "stdout" }, { id: "noise", message: "GET /sign-in 404", timestamp: Date.now(), source: "edge" }]);
  results.ingestUnsigned = await probe("/api/internal/security/ingest", { method: "POST", body: delivery, headers: { "content-type": "application/json" } });
  check(results.ingestUnsigned.status === 401, "ingest-accepted-unsigned-delivery");
  results.ingestMisSigned = await probe("/api/internal/security/ingest", { method: "POST", body: delivery, headers: { "content-type": "application/json", "x-vercel-signature": drainSignature(delivery, "not-the-secret-0123456789abcdefghijk") } });
  check(results.ingestMisSigned.status === 401, "ingest-accepted-mis-signed-delivery");
  results.ingestVerify = await probe("/api/internal/security/ingest", { method: "GET", headers: { "x-vercel-verify": "certify-verify-token" } });
  check(results.ingestVerify.status === 200 && results.ingestVerify.body === "certify-verify-token", "ingest-verification-echo-failed");

  step("ingest accepts a signed synthetic delivery, idempotently");
  const signed = { method: "POST", body: delivery, headers: { "content-type": "application/json", "x-vercel-signature": drainSignature(delivery, drainSecret) } };
  results.ingestSignedFirst = await probe("/api/internal/security/ingest", signed);
  results.ingestSignedSecond = await probe("/api/internal/security/ingest", signed);
  check(results.ingestSignedFirst.status === 200 && results.ingestSignedFirst.body.includes("\"stored\":1"), "ingest-did-not-store-signed-delivery");
  check(results.ingestSignedSecond.status === 200 && results.ingestSignedSecond.body.includes("\"stored\":0"), "ingest-double-counted-redelivery");

  step("retention route fails closed");
  results.retentionUnauthorized = await probe("/api/internal/security/retention");
  check(results.retentionUnauthorized.status === 401 || results.retentionUnauthorized.status === 503, "retention-route-open");
  if (cronSecret) {
    results.retentionAuthorized = await probe("/api/internal/security/retention", { headers: { authorization: `Bearer ${cronSecret}` } });
    check(results.retentionAuthorized.status === 200 && results.retentionAuthorized.body.includes("\"eventsDeleted\":0"), "retention-deleted-fresh-rows-or-failed");
  } else {
    results.retentionAuthorized = "NOT TESTED (CRON_SECRET_STAGING absent from vault)";
  }

  step("real events: unsigned webhook posts produce STAGING events and a STAGING alert");
  const webhookSamples = [];
  for (let index = 0; index < 6; index += 1) {
    const response = await probe("/api/billing/webhook", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
    webhookSamples.push(response.ms);
    check(response.status === 400, `webhook-unsigned-status-${response.status}`);
  }
  results.webhookLatencyMs = webhookSamples;
  await sleep(8_000);
  const stored = await query("select event_type, environment, synthetic, ingest_source, count(*)::int as total from public.security_events where occurred_at >= now() - interval '10 minutes' group by 1,2,3,4 order by 1,2,3,4");
  results.storedLastTenMinutes = stored;
  const realSignatureEvents = stored.filter((row) => row.event_type === "webhook-signature-invalid" && row.synthetic === false && row.environment === "staging").reduce((sum, row) => sum + Number(row.total), 0);
  check(realSignatureEvents >= 6, `real-webhook-events-not-stored:${realSignatureEvents}`);
  const alerts = await query("select rule_key, severity, environment, synthetic, count, threshold, correlation_id, delivery from public.security_alerts where fired_at >= now() - interval '10 minutes' order by fired_at desc");
  results.alertsLastTenMinutes = alerts;
  check(alerts.some((row) => row.rule_key === "webhook-signature-spike" && row.environment === "staging" && row.synthetic === false), "real-staging-alert-did-not-fire");

  step("store holds redacted rows only");
  const leak = await query("select count(*)::int as hits from public.security_events where metadata::text ~* '(sk_(live|test)_|whsec_|eyJ[A-Za-z0-9_-]{10,}\\.|@[a-z0-9.-]+\\.[a-z]{2,}|cus_[A-Za-z0-9]{14,}|sub_[A-Za-z0-9]{14,}|password|cookie|token)' or metadata ? 'clientIp' or metadata ? 'email'");
  results.redactionScan = leak;
  check(Number(leak[0]?.hits ?? 1) === 0, "credential-or-identity-shape-found-in-store");
  const columns = await query("select column_name from information_schema.columns where table_schema='public' and table_name='security_events' order by ordinal_position");
  results.storeColumns = columns.map((row) => row.column_name);
  check(!results.storeColumns.some((name) => /email|ip|user_agent|payload|body/.test(name)), "store-has-identity-column");

  step("latency samples (sign-in, authorization, webhook)");
  const signInSamples = [];
  for (let index = 0; index < 3; index += 1) signInSamples.push((await probe("/sign-in")).ms);
  const adminSamples = [];
  for (let index = 0; index < 3; index += 1) adminSamples.push((await probe("/admin")).ms);
  results.latency = { signInPageMs: signInSamples, adminAnonymousMs: adminSamples, webhookUnsignedMs: webhookSamples };

  evidence.results = results;
}

try {
  if (stage === "migrate" || stage === "all") { step("migrate"); await migrate(); }
  if (stage === "pgtap-remote") { step("pgtap-remote"); await pgtapRemote(); }
  if (stage === "env" || stage === "all") { step("env"); await configureEnv(); }
  if (stage === "deploy" || stage === "all") { step("deploy"); await deploy(); }
  if (stage === "certify" || stage === "all") { step("certify"); await certify(); }
  evidence.completedAt = new Date().toISOString();
  evidence.outcome = "PASS";
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.outcome = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error)).slice(0, 2000);
  process.exitCode = 1;
} finally {
  const evidencePath = join(tmpdir(), `mathnexa-security-observability-evidence-${Date.now()}.json`);
  writeFileSync(evidencePath, redact(JSON.stringify(evidence, null, 2)));
  console.log(redact(JSON.stringify(evidence, null, 2)));
  console.log(`EVIDENCE ${evidencePath}`);
}
